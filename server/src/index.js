import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { User, Department, Doctor, Appointment, QueueEntry, Notification, PredictionLog, AuditLog, Counter, Consultation, DoctorSchedule } from './models.js'

const app = express(), httpServer = createServer(app)
const origin = process.env.CLIENT_ORIGIN || 'http://localhost:5173'
const io = new Server(httpServer, { cors: { origin, methods: ['GET', 'POST', 'PATCH', 'DELETE'] } })
app.use(cors({ origin })); app.use(express.json({ limit: '32kb' }))
app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); next() })
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
const auth = (req, res, next) => { try { const raw = req.headers.authorization || ''; const payload = jwt.verify(raw.replace(/^Bearer\s+/i, ''), process.env.JWT_SECRET); req.user = payload; next() } catch { res.status(401).json({ error: 'Please sign in to continue.' }) } }
const allow = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'You do not have permission to do that.' })
const validId = id => mongoose.isValidObjectId(id)
app.get('/api/health', (req, res) => res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }))
app.post('/api/auth/register', asyncRoute(async (req, res) => { const { name, email, password } = req.body; if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(email || '') || typeof password !== 'string' || password.length < 10) return res.status(400).json({ error: 'Provide a name, valid email, and password of at least 10 characters.' }); const existing = await User.exists({ email: email.toLowerCase() }); if (existing) return res.status(409).json({ error: 'An account with this email already exists.' }); const user = await User.create({ name: name.trim(), email, passwordHash: await bcrypt.hash(password, 12), role: 'patient' }); res.status(201).json({ token: sign(user), user: safeUser(user) }) }))
app.post('/api/auth/login', asyncRoute(async (req, res) => { const user = await User.findOne({ email: String(req.body.email || '').toLowerCase() }); if (!user || !user.active || !await bcrypt.compare(req.body.password || '', user.passwordHash)) return res.status(401).json({ error: 'Email or password is incorrect.' }); res.json({ token: sign(user), user: safeUser(user) }) }))
app.get('/api/auth/me', auth, asyncRoute(async (req, res) => { const user = await User.findById(req.user.sub); if (!user) return res.status(404).json({ error: 'Account not found.' }); res.json({ user: safeUser(user) }) }))
app.get('/api/departments', asyncRoute(async (req, res) => res.json(await Department.find().sort('name'))))
app.get('/api/doctors', asyncRoute(async (req, res) => { const query = { available: true }; if (req.query.department && validId(req.query.department)) query.department = req.query.department; res.json(await Doctor.find(query).populate('user', 'name').populate('department', 'name').sort('specialization')) }))
app.get('/api/doctors/:id/recommendations', auth, allow('patient'), asyncRoute(async (req, res) => {
  if (!validId(req.params.id) || !/^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '')) return res.status(400).json({ error: 'Choose a doctor and valid date.' })
  const doctor = await Doctor.findOne({ _id: req.params.id, available: true }).populate('department').populate('user', 'name')
  if (!doctor) return res.status(404).json({ error: 'Doctor is unavailable.' })
  const dayStart = new Date(`${req.query.date}T00:00:00`), dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1)
  if (!Number.isFinite(dayStart.getTime())) return res.status(400).json({ error: 'Invalid date.' })
  const duration = doctor.department?.appointmentMinutes || doctor.averageConsultationMinutes || 20
  const [schedules, appointments, queueCount] = await Promise.all([
    DoctorSchedule.find({ doctor: doctor._id, startsAt: { $lt: dayEnd }, endsAt: { $gt: dayStart } }).sort('startsAt'),
    Appointment.find({ doctor: doctor._id, startsAt: { $gte: dayStart, $lt: dayEnd }, status: { $in: ['booked', 'checked-in', 'in-consultation'] } }).select('startsAt status'),
    QueueEntry.countDocuments({ doctor: doctor._id, status: { $in: ['waiting', 'in-consultation'] } }),
  ])
  const clinics = schedules.filter(s => s.kind === 'clinic')
  const windows = clinics.length ? clinics.map(s => [new Date(s.startsAt), new Date(s.endsAt)]) : [[new Date(`${req.query.date}T09:00:00`), new Date(`${req.query.date}T17:00:00`)]]
  const blocks = schedules.filter(s => s.kind === 'break' || s.kind === 'unavailable')
  const step = 30 * 60000, length = duration * 60000, now = new Date(), candidates = []
  for (const [windowStart, windowEnd] of windows) for (let time = new Date(windowStart); time.getTime() + length <= windowEnd.getTime(); time = new Date(time.getTime() + step)) {
    const end = new Date(time.getTime() + length)
    if (time <= now || blocks.some(b => time < b.endsAt && end > b.startsAt) || appointments.some(a => time < new Date(a.startsAt.getTime() + length) && end > a.startsAt)) continue
    const nearbyLoad = appointments.filter(a => Math.abs(a.startsAt - time) < 60 * 60000).length
    const score = nearbyLoad * 10 + queueCount * 5
    candidates.push({ startsAt: time, endsAt: end, durationMinutes: duration, workloadScore: score, workload: score < 10 ? 'low' : score < 25 ? 'moderate' : 'high', reason: score < 10 ? 'Light doctor workload around this time.' : score < 25 ? 'Balanced workload around this time.' : 'Higher workload around this time; consider another slot.' })
  }
  candidates.sort((a, b) => a.workloadScore - b.workloadScore || a.startsAt - b.startsAt)
  res.json({ doctor: { id: doctor.id, name: doctor.user?.name, department: doctor.department.name }, date: req.query.date, durationMinutes: duration, slots: candidates.slice(0, 8), note: 'Recommendations use current bookings and queue counts. They are suggestions, not guarantees.' })
}))
app.post('/api/appointments', auth, allow('patient'), asyncRoute(async (req, res) => { const { doctorId, startsAt, reason } = req.body; const start = new Date(startsAt); if (!validId(doctorId) || !Number.isFinite(start.getTime()) || start < new Date() || reason?.length > 400) return res.status(400).json({ error: 'Choose a valid doctor and future appointment time.' }); const doctor = await Doctor.findOne({ _id: doctorId, available: true }).populate('department'); if (!doctor) return res.status(404).json({ error: 'Doctor is unavailable.' }); const end = new Date(start.getTime() + (doctor.department?.appointmentMinutes || 20) * 60000); const conflict = await Appointment.exists({ doctor: doctor._id, status: { $in: ['booked', 'checked-in', 'in-consultation'] }, startsAt: { $gt: new Date(start.getTime() - (doctor.department?.appointmentMinutes || 20) * 60000), $lt: end } }); if (conflict) return res.status(409).json({ error: 'This appointment overlaps another booking. Choose a recommended open slot.' }); try { const appointment = await Appointment.create({ patient: req.user.sub, doctor: doctor._id, department: doctor.department._id, startsAt: start, reason }); await AuditLog.create({ actor: req.user.sub, action: 'appointment.booked', targetType: 'Appointment', targetId: appointment.id }); await notifyUser(req.user.sub, `Appointment booked for ${start.toLocaleString()}.`); res.status(201).json(await appointment.populate([{ path: 'doctor', populate: { path: 'user', select: 'name' } }, { path: 'department', select: 'name' }])) } catch (err) { if (err.code === 11000) return res.status(409).json({ error: 'That doctor already has an appointment at this time.' }); throw err } }))
app.get('/api/appointments', auth, asyncRoute(async (req, res) => { const page = Math.max(1, parseInt(req.query.page) || 1), limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20)); const query = req.user.role === 'patient' ? { patient: req.user.sub } : {}; if (req.user.role === 'doctor') { const doctor = await Doctor.findOne({ user: req.user.sub }); query.doctor = doctor?._id || null } if (req.query.status) query.status = req.query.status; const [items, total] = await Promise.all([Appointment.find(query).sort('startsAt').skip((page - 1) * limit).limit(limit).populate('patient', 'name').populate({ path: 'doctor', populate: { path: 'user', select: 'name' } }).populate('department', 'name'), Appointment.countDocuments(query)]); res.json({ items, page, pages: Math.ceil(total / limit), total }) }))
app.patch('/api/appointments/:id/cancel', auth, asyncRoute(async (req, res) => { if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid appointment id.' }); const query = { _id: req.params.id, status: { $in: ['booked', 'checked-in'] } }; if (req.user.role === 'patient') query.patient = req.user.sub; else if (req.user.role === 'doctor') { const doctor = await Doctor.findOne({ user: req.user.sub }); if (!doctor) return res.status(403).json({ error: 'You do not have permission to do that.' }); query.doctor = doctor._id } else if (req.user.role !== 'admin') return res.status(403).json({ error: 'You do not have permission to do that.' }); const appointment = await Appointment.findOneAndUpdate(query, { status: 'cancelled' }, { new: true }); if (!appointment) return res.status(404).json({ error: 'Appointment not found or can no longer be cancelled.' }); await QueueEntry.updateOne({ appointment: appointment.id }, { status: 'cancelled' }); await notifyUser(appointment.patient, 'Your appointment was cancelled.'); io.to(`department:${appointment.department}`).emit('queue:changed', { department: String(appointment.department) }); res.json(appointment) }))
app.post('/api/appointments/:id/check-in', auth, asyncRoute(async (req, res) => { if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid appointment id.' }); const query = { _id: req.params.id, status: 'booked' }; if (req.user.role === 'patient') query.patient = req.user.sub; else if (req.user.role === 'doctor') { const doctor = await Doctor.findOne({ user: req.user.sub }); if (!doctor) return res.status(403).json({ error: 'You do not have permission to do that.' }); query.doctor = doctor._id } else if (req.user.role !== 'admin') return res.status(403).json({ error: 'You do not have permission to do that.' }); const appointment = await Appointment.findOneAndUpdate(query, { status: 'checked-in' }, { new: true }).populate('department'); if (!appointment) return res.status(404).json({ error: 'Appointment not found or already checked in.' }); const day = new Date().toISOString().slice(0, 10); let sequence; try { sequence = await nextQueueNumber(`${appointment.department._id}:${day}`) } catch (error) { await Appointment.updateOne({ _id: appointment._id, status: 'checked-in' }, { status: 'booked' }); throw error } const token = `Q${day.replaceAll('-', '')}-${String(sequence).padStart(3, '0')}`; let entry; try { entry = await QueueEntry.create({ appointment: appointment._id, patient: appointment.patient, doctor: appointment.doctor, department: appointment.department._id, token }) } catch (err) { await Appointment.updateOne({ _id: appointment._id, status: 'checked-in' }, { status: 'booked' }); if (err.code === 11000) return res.status(409).json({ error: 'This appointment already has a queue token.' }); throw err } const estimate = await estimateWait(entry, true); await entry.populate([{ path: 'patient', select: 'name' }, { path: 'department', select: 'name' }, { path: 'doctor', populate: { path: 'user', select: 'name' } }, { path: 'appointment', select: 'startsAt' }]); await notifyUser(appointment.patient, `Checked in with queue token ${token}. Estimated wait ${estimate.low}–${estimate.high} minutes; estimate only.`); io.to(`department:${appointment.department._id}`).emit('queue:changed', { department: String(appointment.department._id) }); res.status(201).json({ entry, estimate }) }))
app.get('/api/queue', auth, asyncRoute(async (req, res) => { const query = { status: { $in: ['waiting', 'in-consultation'] } }; if (req.user.role === 'patient') query.patient = req.user.sub; if (req.query.department && validId(req.query.department)) query.department = req.query.department; if (req.user.role === 'doctor') { const doctor = await Doctor.findOne({ user: req.user.sub }); if (!doctor) return res.json([]); query.doctor = doctor._id } const entries = await QueueEntry.find(query).sort('checkedInAt').populate('patient', 'name').populate('department', 'name').populate({ path: 'doctor', populate: { path: 'user', select: 'name' } }).populate('appointment', 'startsAt'); res.json(await Promise.all(entries.map(async entry => ({ ...entry.toObject(), estimate: await estimateWait(entry) })))) }))
app.patch('/api/queue/:id/status', auth, allow('doctor', 'admin'), asyncRoute(async (req, res) => { if (!validId(req.params.id) || !['in-consultation', 'completed', 'waiting'].includes(req.body.status)) return res.status(400).json({ error: 'Invalid queue update.' }); const entry = await QueueEntry.findById(req.params.id); if (!entry) return res.status(404).json({ error: 'Queue entry not found.' }); if (req.user.role === 'doctor') { const doctor = await Doctor.findOne({ user: req.user.sub }); if (!doctor || !doctor._id.equals(entry.doctor)) return res.status(403).json({ error: 'This queue belongs to another doctor.' }) } entry.status = req.body.status; if (entry.status === 'in-consultation') { entry.startedAt = new Date(); await Consultation.findOneAndUpdate({ appointment: entry.appointment }, { $setOnInsert: { appointment: entry.appointment, startedAt: entry.startedAt } }, { upsert: true, new: true, setDefaultsOnInsert: true }) } if (entry.status === 'completed') { entry.completedAt = new Date(); const consultation = await Consultation.findOne({ appointment: entry.appointment }); const startedAt = consultation?.startedAt || entry.startedAt || entry.completedAt; await Consultation.findOneAndUpdate({ appointment: entry.appointment }, { $set: { startedAt, endedAt: entry.completedAt, actualMinutes: Math.max(1, Math.ceil((entry.completedAt - startedAt) / 60000)) } }, { upsert: true, new: true, setDefaultsOnInsert: true }) } await entry.save(); await Appointment.updateOne({ _id: entry.appointment }, { status: entry.status === 'completed' ? 'completed' : entry.status }); if (entry.status === 'in-consultation') await notifyUser(entry.patient, 'Your consultation is starting now.'); if (entry.status === 'completed') await notifyUser(entry.patient, 'Your consultation is complete.'); io.to(`department:${entry.department}`).emit('queue:changed', { department: String(entry.department) }); res.json(entry) }))
app.get('/api/queue/:id/prediction', auth, asyncRoute(async (req, res) => { if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid queue entry id.' }); const entry = await QueueEntry.findById(req.params.id); if (!entry) return res.status(404).json({ error: 'Queue entry not found.' }); if (req.user.role === 'patient' && String(entry.patient) !== req.user.sub) return res.status(403).json({ error: 'This queue entry belongs to another patient.' }); if (req.user.role === 'doctor') { const doctor = await Doctor.findOne({ user: req.user.sub }); if (!doctor || !doctor._id.equals(entry.doctor)) return res.status(403).json({ error: 'This queue belongs to another doctor.' }) } const prediction = await estimateWait(entry, true); res.json({ ...prediction, isEstimate: true, message: 'This estimate may change as the queue moves; it is not a guaranteed waiting time.' }) }))
app.get('/api/notifications', auth, asyncRoute(async (req, res) => res.json(await Notification.find({ user: req.user.sub }).sort('-createdAt').limit(50))))
app.patch('/api/notifications/read-all', auth, asyncRoute(async (req, res) => { await Notification.updateMany({ user: req.user.sub, readAt: { $exists: false } }, { readAt: new Date() }); res.json({ ok: true }) }))
app.patch('/api/notifications/:id/read', auth, asyncRoute(async (req, res) => { if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid notification id.' }); const item = await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user.sub }, { readAt: new Date() }, { new: true }); if (!item) return res.status(404).json({ error: 'Notification not found.' }); res.json(item) }))
app.get('/api/admin/analytics', auth, allow('admin'), asyncRoute(async (req, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  const [appointmentsToday, statusCounts, departments, activeDoctors, activeQueue] = await Promise.all([
    Appointment.countDocuments({ startsAt: { $gte: today, $lt: tomorrow } }),
    Appointment.aggregate([{ $match: { startsAt: { $gte: today, $lt: tomorrow } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Department.find().sort('name'),
    Doctor.countDocuments({ available: true }),
    QueueEntry.find({ status: { $in: ['waiting', 'in-consultation'] } }).select('department doctor status'),
  ])
  const congestion = await Promise.all(departments.map(async department => {
    const doctors = await Doctor.find({ department: department._id })
    const available = doctors.filter(doctor => doctor.available)
    const entries = activeQueue.filter(entry => String(entry.department) === String(department._id))
    const waiting = entries.filter(entry => entry.status === 'waiting').length
    const typical = available.length ? available.reduce((sum, doctor) => sum + (doctor.averageConsultationMinutes || department.appointmentMinutes), 0) / available.length : department.appointmentMinutes
    const delay = Math.ceil(waiting * typical / Math.max(available.length, 1))
    const workload = Math.min(100, Math.round(waiting / Math.max(available.length * 5, 1) * 100))
    const level = workload >= 75 ? 'high' : workload >= 40 ? 'moderate' : 'low'
    return { id: department.id, name: department.name, waiting, inConsultation: entries.length - waiting, availableDoctors: available.length, totalDoctors: doctors.length, estimatedWaitMinutes: delay, rangeLow: Math.max(0, delay - Math.ceil(typical * .35)), rangeHigh: delay + Math.ceil(typical * .35), workload, level, basis: 'Queue count and configured consultation durations; operational estimate.' }
  }))
  const waitingDepartments = congestion.filter(department => department.waiting > 0)
  const totalWaiting = waitingDepartments.reduce((sum, department) => sum + department.waiting, 0)
  const averageWait = totalWaiting ? Math.round(waitingDepartments.reduce((sum, department) => sum + department.estimatedWaitMinutes * department.waiting, 0) / totalWaiting) : 0
  res.json({ appointmentsToday, appointmentStatuses: statusCounts, activeDoctors, activeQueue: activeQueue.length, waitingPatients: totalWaiting, averageWaitMinutes: averageWait, departments: congestion })
}))
io.use((socket, next) => { try { socket.user = jwt.verify(socket.handshake.auth?.token || '', process.env.JWT_SECRET); next() } catch { next(new Error('Authentication required')) } })
io.on('connection', socket => { socket.join(`user:${socket.user.sub}`); socket.on('queue:join', async departmentId => { try { if (!mongoose.isValidObjectId(departmentId)) return; let allowed = socket.user.role === 'admin'; if (socket.user.role === 'doctor') { const doctor = await Doctor.findOne({ user: socket.user.sub }); allowed = Boolean(doctor && String(doctor.department) === String(departmentId)) } if (socket.user.role === 'patient') allowed = Boolean(await QueueEntry.exists({ patient: socket.user.sub, department: departmentId, status: { $in: ['waiting', 'in-consultation'] } })); if (allowed) socket.join(`department:${departmentId}`); else socket.emit('queue:error', { message: 'You are not authorized to subscribe to this department.' }) } catch { socket.emit('queue:error', { message: 'Could not authorize this queue subscription.' }) } }) })
app.use((err, req, res, next) => { console.error(err); if (err.name === 'ValidationError') return res.status(400).json({ error: 'Some submitted information is invalid.' }); res.status(500).json({ error: 'Something went wrong. Please try again.' }) })
function sign(user) { if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be set to at least 32 characters.'); return jwt.sign({ sub: String(user._id), role: user.role }, process.env.JWT_SECRET, { expiresIn: '12h' }) }
function safeUser(user) { return { id: user.id, name: user.name, email: user.email, role: user.role } }
async function nextQueueNumber(key) { try { return (await Counter.findOneAndUpdate({ key }, { $inc: { value: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true })).value } catch (error) { if (error.code !== 11000) throw error; return (await Counter.findOneAndUpdate({ key }, { $inc: { value: 1 } }, { new: true })).value } }
async function notifyUser(userId, message) { const notification = await Notification.create({ user: userId, message }); io.to(`user:${userId}`).emit('notification:new', notification); return notification }
async function estimateWait(entry, saveLog = false) {
  const doctorId = entry.doctor?._id || entry.doctor
  const now = new Date()
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0)
  const [ahead, doctor, active, history, breakSchedule, scheduledAhead] = await Promise.all([
    QueueEntry.countDocuments({ doctor: doctorId, status: 'waiting', checkedInAt: { $lt: entry.checkedInAt } }),
    Doctor.findById(doctorId),
    QueueEntry.findOne({ doctor: doctorId, status: 'in-consultation' }),
    Consultation.aggregate([
      { $lookup: { from: 'appointments', localField: 'appointment', foreignField: '_id', as: 'appointmentData' } },
      { $unwind: '$appointmentData' },
      { $match: { 'appointmentData.doctor': new mongoose.Types.ObjectId(String(doctorId)), actualMinutes: { $gt: 0 } } },
      { $group: { _id: null, count: { $sum: 1 }, average: { $avg: '$actualMinutes' }, deviation: { $stdDevPop: '$actualMinutes' } } },
    ]),
    DoctorSchedule.findOne({ doctor: doctorId, kind: { $in: ['break', 'unavailable'] }, startsAt: { $lte: now }, endsAt: { $gt: now } }).sort('endsAt'),
    Appointment.countDocuments({ doctor: doctorId, status: 'booked', startsAt: { $gte: dayStart, $lt: now } }),
  ])
  const historical = history[0]
  const sampleCount = historical?.count || 0
  const typical = sampleCount >= 5 ? historical.average : (doctor?.averageConsultationMinutes || 20)
  const activeStartedAt = active?.startedAt
  const elapsed = activeStartedAt ? Math.max(0, (now - activeStartedAt) / 60000) : 0
  const currentRemaining = active ? Math.max(0, Math.ceil(typical - elapsed)) : 0
  const breakDelay = breakSchedule?.endsAt ? Math.max(0, Math.ceil((breakSchedule.endsAt - now) / 60000)) : 0
  const unavailableDelay = doctor && !doctor.available && !breakSchedule ? 60 : 0
  const scheduleDelay = Math.max(breakDelay, unavailableDelay)
  const minutes = Math.max(0, Math.ceil((ahead + scheduledAhead) * typical + currentRemaining + scheduleDelay))
  const uncertainty = sampleCount >= 5 ? Math.max(1, Math.ceil(historical.deviation || 1)) : Math.ceil(typical * .35)
  const factors = [`${ahead} checked-in patients ahead`, `${scheduledAhead} earlier appointments not yet checked in`, sampleCount >= 5 ? `Average consultation: ${Math.round(typical)} min from ${sampleCount} completed visits` : `Configured consultation baseline: ${typical} min; historical sample is insufficient`, ...(active ? [`Current consultation: ${Math.ceil(elapsed)} min elapsed, about ${currentRemaining} min remaining`] : []), ...(breakSchedule ? [`Doctor ${breakSchedule.kind} until ${new Date(breakSchedule.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`] : []), ...(unavailableDelay ? ['Doctor marked unavailable; using a 60 minute fallback'] : [])]
  const result = { minutes, low: Math.max(0, minutes - uncertainty), high: minutes + uncertainty, method: sampleCount >= 5 ? 'historical-duration-baseline' : 'configured-duration-baseline', confidence: sampleCount >= 30 ? 'moderate' : sampleCount >= 10 ? 'low' : 'limited', sampleCount, factors }
  if (saveLog) await PredictionLog.create({ queueEntry: entry._id, waitMinutes: minutes, rangeLow: result.low, rangeHigh: result.high, method: result.method, factors })
  return result
}
const port = Number(process.env.PORT || 4000)
if (!process.env.JWT_SECRET) console.error('Set JWT_SECRET in server/.env before starting the API.')
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mediflow').then(() => httpServer.listen(port, () => console.log(`MediFlow API listening on http://localhost:${port}`))).catch(err => { console.error('MongoDB connection failed:', err.message); process.exitCode = 1 })
