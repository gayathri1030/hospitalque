import 'dotenv/config'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { User, Department, Doctor, Appointment } from './models.js'

if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in server/.env first.')
await mongoose.connect(process.env.MONGODB_URI)
const departments = await Promise.all([
  { name: 'Cardiology', description: 'Heart and cardiovascular care', appointmentMinutes: 20 },
  { name: 'Neurology', description: 'Brain and nervous system care', appointmentMinutes: 25 },
  { name: 'Pediatrics', description: 'Care for infants, children, and adolescents', appointmentMinutes: 20 },
  { name: 'Orthopedics', description: 'Bone, joint, and muscle care', appointmentMinutes: 20 },
].map(data => Department.findOneAndUpdate({ name: data.name }, data, { upsert: true, new: true })))
const getUser = async (email, name, role) => User.findOneAndUpdate({ email }, { $setOnInsert: { email, name, role, passwordHash: await bcrypt.hash('MediFlowDemo!2026', 12) } }, { upsert: true, new: true })
const [maya, james, elena, admin, patient] = await Promise.all([
  getUser('maya.chen@mediflow.demo', 'Maya Chen', 'doctor'), getUser('james.park@mediflow.demo', 'James Park', 'doctor'),
  getUser('elena.garcia@mediflow.demo', 'Elena Garcia', 'doctor'), getUser('admin@mediflow.demo', 'Alex Rivera', 'admin'),
  getUser('patient@mediflow.demo', 'Amara Johnson', 'patient'),
])
const doctors = await Promise.all([[maya, departments[0]], [james, departments[1]], [elena, departments[2]]].map(([user, department]) => Doctor.findOneAndUpdate({ user: user._id }, { user: user._id, department: department._id, specialization: department.name, available: true, averageConsultationMinutes: department.appointmentMinutes }, { upsert: true, new: true })))
console.log(`Seeded ${departments.length} departments, ${doctors.length} doctors, and demo accounts.`)
console.log('Demo login password for all accounts: MediFlowDemo!2026')
console.log(`Admin: ${admin.email} | Patient: ${patient.email}`)
await mongoose.disconnect()
