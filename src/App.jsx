import React,{useEffect,useMemo,useRef,useState} from'react'
import{api,apiBaseUrl} from'./api.js'
import{io} from'socket.io-client'
import{QRCodeSVG} from'qrcode.react'
import{Activity,ArrowDownRight,ArrowRight,ArrowUpRight,Bell,CalendarDays,Check,CheckCheck,ChevronDown,ChevronLeft,ChevronRight,Clock3,Command,Download,ExternalLink,Filter,HeartPulse,HelpCircle,LayoutDashboard,LogOut,Menu,MessageCircle,Moon,MoreHorizontal,Plus,Search,Settings,ShieldCheck,Sparkles,Sun,Users,Video,X} from'lucide-react'
import{Area,AreaChart,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis} from'recharts'

const basePatients=[
{id:'MF-2048',name:'Amara Johnson',initials:'AJ',doctor:'Dr. Maya Chen',dept:'Cardiology',time:'09:20 AM',wait:'8 min',status:'In consultation',tone:'blue',checked:true},
{id:'MF-2049',name:'Ethan Williams',initials:'EW',doctor:'Dr. Maya Chen',dept:'Cardiology',time:'09:35 AM',wait:'18 min',status:'Waiting',tone:'amber'},
{id:'MF-2050',name:'Sofia Martinez',initials:'SM',doctor:'Dr. James Park',dept:'Neurology',time:'09:40 AM',wait:'12 min',status:'Waiting',tone:'amber'},
{id:'MF-2051',name:'Noah Thompson',initials:'NT',doctor:'Dr. Maya Chen',dept:'Cardiology',time:'09:50 AM',wait:'32 min',status:'Checked in',tone:'slate'},
{id:'MF-2052',name:'Olivia Patel',initials:'OP',doctor:'Dr. Elena Garcia',dept:'Pediatrics',time:'10:00 AM',wait:'5 min',status:'Waiting',tone:'amber'},
]
const chartData=[{t:'8 AM',patients:12,wait:18},{t:'9 AM',patients:19,wait:28},{t:'10 AM',patients:15,wait:22},{t:'11 AM',patients:24,wait:38},{t:'12 PM',patients:18,wait:30},{t:'1 PM',patients:27,wait:44},{t:'2 PM',patients:21,wait:35}]
const departments=[{name:'Cardiology',count:18,delay:'24 min',level:'Moderate',pct:66,color:'amber',icon:'♡'},{name:'Neurology',count:12,delay:'12 min',level:'Low',pct:38,color:'green',icon:'✳'},{name:'Pediatrics',count:24,delay:'42 min',level:'High',pct:88,color:'red',icon:'✦'},{name:'Orthopedics',count:9,delay:'8 min',level:'Low',pct:28,color:'green',icon:'⌁'}]
const localDateTime=(date)=>{const shifted=new Date(date.getTime()-date.getTimezoneOffset()*60000);return shifted.toISOString().slice(0,16)}
function App(){
const[active,setActive]=useState('Overview')
const[role,setRole]=useState('Admin')
const[patients,setPatients]=useState(basePatients)
const[query,setQuery]=useState('')
const[dept,setDept]=useState('All departments')
const[dark,setDark]=useState(false)
const[modal,setModal]=useState('')
const[notice,setNotice]=useState('')
const[mobileNav,setMobileNav]=useState(false)
const[formName,setFormName]=useState('')
const[formDept,setFormDept]=useState('Cardiology')
const[formDoctor,setFormDoctor]=useState('Dr. Maya Chen')
const[account,setAccount]=useState(null)
const[authToken,setAuthToken]=useState(()=>sessionStorage.getItem('mediflow-token'))
const[authMode,setAuthMode]=useState('login')
const[authName,setAuthName]=useState('')
const[authEmail,setAuthEmail]=useState('')
const[authPassword,setAuthPassword]=useState('')
const[authError,setAuthError]=useState('')
const[authBusy,setAuthBusy]=useState(false)
const[authLoading,setAuthLoading]=useState(Boolean(sessionStorage.getItem('mediflow-token')))
const[bookingDoctors,setBookingDoctors]=useState([])
const[bookingDepartments,setBookingDepartments]=useState([])
const[bookingDoctorId,setBookingDoctorId]=useState('')
const[bookingDepartmentId,setBookingDepartmentId]=useState('')
const[bookingStartsAt,setBookingStartsAt]=useState(()=>localDateTime(new Date(Date.now()+86400000)))
const[bookingReason,setBookingReason]=useState('')
const[bookingError,setBookingError]=useState('')
const[bookingLoading,setBookingLoading]=useState(false)
const[bookingBusy,setBookingBusy]=useState(false)
const[slotSuggestions,setSlotSuggestions]=useState([])
const[slotNote,setSlotNote]=useState('')
const[slotLoading,setSlotLoading]=useState(false)
const[appointmentRecords,setAppointmentRecords]=useState([])
const[appointmentsLoading,setAppointmentsLoading]=useState(false)
const[appointmentsError,setAppointmentsError]=useState('')
const[liveQueue,setLiveQueue]=useState([])
const[queueError,setQueueError]=useState('')
const[queueBusyId,setQueueBusyId]=useState('')
const[selectedEstimate,setSelectedEstimate]=useState(null)
const[analytics,setAnalytics]=useState(null)
const[analyticsError,setAnalyticsError]=useState('')
const[notificationItems,setNotificationItems]=useState([])
const[notificationError,setNotificationError]=useState('')
const[accessibility,setAccessibility]=useState(()=>localStorage.getItem('mediflow-accessibility')==='true')
const queueSocketRef=useRef(null)
const recommendationDate=bookingStartsAt.slice(0,10)
const queueRows=useMemo(()=>account?liveQueue.map(entry=>({id:entry.token,queueId:entry._id,appointmentId:entry.appointment?._id||entry.appointment,name:entry.patient?.name||'Patient',initials:(entry.patient?.name||'P').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase(),doctor:entry.doctor?.user?.name?`Dr.${entry.doctor.user.name}`:'Doctor',dept:entry.department?.name||'Department',time:entry.appointment?.startsAt?new Date(entry.appointment.startsAt).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}):'Walk-in',wait:`${entry.estimate?.low??0}–${entry.estimate?.high??0} min`,estimate:entry.estimate,status:entry.status==='in-consultation'?'In consultation':'Waiting',tone:entry.status==='in-consultation'?'blue':'amber'})):patients,[account,liveQueue,patients])
const shown=useMemo(()=>queueRows.filter(p=>(dept==='All departments'||p.dept===dept)&&`${p.name}${p.id}${p.doctor}`.toLowerCase().includes(query.toLowerCase())),[queueRows,query,dept])
const radarDepartments=account?account.role==='admin'&&analytics?analytics.departments.map(d=>({name:d.name,count:d.waiting,delay:`${d.rangeLow}–${d.rangeHigh}min`,level:d.level==='high'?'High':d.level==='moderate'?'Moderate':'Low',pct:d.workload,color:d.level==='high'?'red':d.level==='moderate'?'amber':'green',icon:d.name==='Cardiology'?'♡':'✳'})):[]:departments
const departmentNames=account?.role==='admin'&&analytics?analytics.departments.map(d=>d.name):departments.map(d=>d.name)
const tr=(word)=>word
const trDisplay=(text)=>text
const unreadNotifications=notificationItems.filter(item=>!item.readAt).length
const toast=(msg)=>{setNotice(trDisplay(msg));window.setTimeout(()=>setNotice(''),2800)}
useEffect(()=>{
if(!authToken)return
api('/api/auth/me',{token:authToken}).then(({user})=>{
setAccount(user)
setRole(user.role[0].toUpperCase()+user.role.slice(1))
}).catch(()=>{sessionStorage.removeItem('mediflow-token');setAuthToken(null)}).finally(()=>setAuthLoading(false))
},[])
useEffect(()=>{
if(modal!=='appointment'||!authToken||account?.role!=='patient')return
let active=true
setBookingLoading(true);setBookingError('')
Promise.all([api('/api/departments'),api('/api/doctors')]).then(([departmentList,doctorList])=>{
if(!active)return
setBookingDepartments(departmentList);setBookingDoctors(doctorList)
const firstDepartment=departmentList[0]?._id||''
const firstDoctor=doctorList.find(d=>String(d.department?._id)===String(firstDepartment))||doctorList[0]
setBookingDepartmentId(current=>current||firstDepartment)
setBookingDoctorId(current=>current||firstDoctor?._id||'')
}).catch(error=>{if(active)setBookingError(`${trDisplay(error.message)}. ${tr('Confirm the API and database are available.')}`)}).finally(()=>{if(active)setBookingLoading(false)})
return()=>{active=false}
},[modal,authToken,account])
useEffect(()=>{
if(modal!=='appointment'||account?.role!=='patient'||!authToken||!bookingDoctorId)return
let current=true
setSlotLoading(true);setSlotSuggestions([]);setSlotNote('')
api(`/api/doctors/${bookingDoctorId}/recommendations?date=${recommendationDate}`,{token:authToken}).then(result=>{if(current){setSlotSuggestions(result.slots);setSlotNote(result.note)}}).catch(error=>{if(current)setSlotNote(error.message)}).finally(()=>{if(current)setSlotLoading(false)})
return()=>{current=false}
},[modal,authToken,account?.role,bookingDoctorId,recommendationDate])
useEffect(()=>{
if(account?.role!=='admin'||!authToken){setAnalytics(null);return}
let current=true
const refresh=()=>api('/api/admin/analytics',{token:authToken}).then(result=>{if(current){setAnalytics(result);setAnalyticsError('')}}).catch(error=>{if(current)setAnalyticsError(error.message)})
refresh()
const interval=window.setInterval(refresh,30000)
return()=>{current=false;window.clearInterval(interval)}
},[authToken,account?.role])
useEffect(()=>{localStorage.setItem('mediflow-accessibility',String(accessibility))},[accessibility])
useEffect(()=>{
if(!authToken||!account){setNotificationItems([]);return}
let current=true
api('/api/notifications',{token:authToken}).then(items=>{if(current){setNotificationItems(items);setNotificationError('')}}).catch(error=>{if(current)setNotificationError(error.message)})
return()=>{current=false}
},[authToken,account])
useEffect(()=>{
if(active!=='Appointments'||!authToken)return
let current=true
setAppointmentsLoading(true);setAppointmentsError('')
api('/api/appointments?limit=50',{token:authToken}).then(result=>{if(current)setAppointmentRecords(result.items)}).catch(error=>{if(current)setAppointmentsError(error.message)}).finally(()=>{if(current)setAppointmentsLoading(false)})
return()=>{current=false}
},[active,authToken])
useEffect(()=>{
if(!authToken||!account)return
let current=true
const socket=io(apiBaseUrl,{auth:{token:authToken},transports:['websocket','polling']})
queueSocketRef.current=socket
const loadQueue=async()=>{
try{
const entries=await api('/api/queue',{token:authToken})
if(!current)return
setLiveQueue(entries);setQueueError('')
for (const entry of entries)if(entry.department?._id)socket.emit('queue:join',entry.department._id)
} catch(error){if(current)setQueueError(error.message)}
}
socket.on('connect',loadQueue)
socket.on('queue:changed',loadQueue)
socket.on('queue:error',({message})=>{if(current)setQueueError(message)})
socket.on('notification:new',item=>{if(current)setNotificationItems(items=>[item,...items.filter(existing=>existing._id!==item._id)].slice(0,50))})
loadQueue()
return()=>{current=false;socket.disconnect();queueSocketRef.current=null}
},[authToken,account])
const submitAuth=async(e)=>{
e.preventDefault();setAuthBusy(true);setAuthError('')
try{
const path=authMode==='login'?'/api/auth/login':'/api/auth/register'
const payload=authMode==='login'?{email:authEmail,password:authPassword}:{name:authName,email:authEmail,password:authPassword}
const result=await api(path,{method:'POST',body:JSON.stringify(payload)})
sessionStorage.setItem('mediflow-token',result.token);setAuthToken(result.token);setAccount(result.user)
setRole(result.user.role[0].toUpperCase()+result.user.role.slice(1));setModal('');setAuthPassword('');toast(`Signed in as ${result.user.role}`)
} catch(error){setAuthError(`${trDisplay(error.message)}.${tr('Check that the API is running at')}$ {apiBaseUrl}.`)}
finally{setAuthBusy(false)}
}
const signOut=()=>{sessionStorage.removeItem('mediflow-token');setAuthToken(null);setAccount(null);setRole('Admin');toast('Signed out. Demo dashboard is active.')}
const openNotifications=async()=>{if(!account||!authToken){toast('Sign in to view your notifications.');return}setModal('notifications');try{const items=await api('/api/notifications',{token:authToken});setNotificationItems(items);setNotificationError('')} catch(error){setNotificationError(error.message)}}
const markNotificationRead=async(id)=>{try{const item=await api(`/api/notifications/${id}/read`,{token:authToken,method:'PATCH'});setNotificationItems(items=>items.map(current=>current._id===id?item:current))} catch(error){setNotificationError(error.message)}}
const markAllNotificationsRead=async()=>{try{await api('/api/notifications/read-all',{token:authToken,method:'PATCH'});setNotificationItems(items=>items.map(item=>({...item,readAt:item.readAt||new Date().toISOString()})))} catch(error){setNotificationError(error.message)}}
const addPatient=(e)=>{e.preventDefault();if(!formName.trim())return;const initials=formName.trim().split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();setPatients([{id:`MF-${2053+patients.length-basePatients.length}`,name:formName.trim(),initials,doctor:formDoctor,dept:formDept,time:'10:15 AM',wait:'28 min',status:'Checked in',tone:'slate'},...patients]);setModal('');setFormName('');toast('Patient added to the live queue')}
const submitBooking=async(e)=>{
e.preventDefault()
if(!account)return addPatient(e)
if(account.role!=='patient')return setBookingError('Only patient accounts can book appointments.')
setBookingBusy(true);setBookingError('')
try{
const created=await api('/api/appointments',{token:authToken,method:'POST',body:JSON.stringify({doctorId:bookingDoctorId,startsAt:new Date(bookingStartsAt).toISOString(),reason:bookingReason})})
setModal('');setBookingReason('');setActive('Appointments');toast(`Appointment booked for ${new Date(created.startsAt).toLocaleString()}`)
} catch(error){setBookingError(error.message)}
finally{setBookingBusy(false)}
}
const openAppointment=()=>{if(authLoading){toast('Restoring your secure session. Try again in a moment.');return}if(account&&account.role!=='patient'){toast('Appointment booking is available to patient accounts.');return}if(authToken&&!account){toast('Please sign in again before booking.');return}setBookingError('');setModal('appointment')}
const cancelAppointment=async(id)=>{try{await api(`/api/appointments/${id}/cancel`,{token:authToken,method:'PATCH'});setAppointmentRecords(records=>records.map(item=>item._id===id?{...item,status:'cancelled'}:item));toast('Appointment cancelled')} catch(error){toast(error.message)}}
const checkInAppointment=async(id)=>{setQueueBusyId(id);try{const result=await api(`/api/appointments/${id}/check-in`,{token:authToken,method:'POST'});const entry={...result.entry,estimate:result.estimate};setAppointmentRecords(records=>records.map(item=>item._id===id?{...item,status:'checked-in'}:item));setLiveQueue(entries=>[entry,...entries.filter(item=>item._id!==entry._id)]);if(entry.department?._id)queueSocketRef.current?.emit('queue:join',entry.department._id);toast(`Checked in · queue token ${entry.token}`)} catch(error){toast(error.message)} finally{setQueueBusyId('')}}
const doctorOptions=bookingDoctors.filter(d=>!bookingDepartmentId||String(d.department?._id)===bookingDepartmentId)
const updateStatus=async(id)=>{
if(!account){setPatients(patients.map(p=>p.id===id?{...p,status:p.status==='Waiting'?'In consultation':p.status==='In consultation'?'Completed':'Waiting',tone:p.status==='Waiting'?'blue':'green'}:p));return}
if(!['doctor','admin'].includes(account.role))return toast('Queue status can only be changed by a doctor or administrator.')
const entry=liveQueue.find(item=>item._id===id)
if(!entry)return
const status=entry.status==='waiting'?'in-consultation':'completed'
setQueueBusyId(id)
try{await api(`/api/queue/${id}/status`,{token:authToken,method:'PATCH',body:JSON.stringify({status})});setLiveQueue(rows=>status==='completed'?rows.filter(item=>item._id!==id):rows.map(item=>item._id===id?{...item,status}:item));toast(`Queue updated: ${status.replaceAll('-',' ')}`)}
catch(error){toast(error.message)}
finally{setQueueBusyId('')}
}
const nav=[{group:'WORKSPACE',items:[{name:'Overview',icon:LayoutDashboard},{name:'Appointments',icon:CalendarDays,badge:'12'},{name:'Live Queue',icon:Users},{name:'Doctors',icon:HeartPulse},{name:'Departments',icon:Activity}]},{group:'INSIGHTS',items:[{name:'Analytics',icon:Activity},{name:'AI Insights',icon:Sparkles,badge:'New'}]}]
return <div className={`app ${dark?'dark':''} ${accessibility?'accessible':''}`}>
<a className="skip-link" href="#main-content">{tr('Skip to main content')}</a>
<aside className={`sidebar ${mobileNav?'open':''}`}>
<div className="brand"><div className="brand-icon"><HeartPulse size={21}/></div><div className="brand-name">mediflow<span>AI</span><small>{tr("HOSPITAL INTELLIGENCE")}</small></div><button className="icon-btn mobile-close" onClick={()=>setMobileNav(false)} aria-label="Close menu"><X size={18}/></button></div>
<button className="hospital-select" onClick={()=>toast(tr('You are viewing Northstar Medical Center'))}><div className="hospital-mark">N</div><div><b>Northstar Medical</b><small>Central Hospital</small></div><ChevronDown size={15}/></button>
{nav.map(section=><div className="nav-section" key={section.group}><div className="nav-label">{tr(section.group)}</div>{section.items.map(({name,icon:Icon,badge})=><button key={name}className={`nav-item${active===name?' selected':''}`} onClick={()=>{setActive(name);setMobileNav(false)}}><Icon size={18}/><span>{tr(name)}</span>{badge&&<i className={badge==='New'?'nav-new':'nav-badge'}>{badge}</i>}</button>)}</div>)}
<div className="sidebar-spacer"/><div className="sidebar-bottom"><div className="sidebar-ai"><div className="ai-icon"><Sparkles size={16}/></div><b>{tr("AI Queue Assistant")}</b><p>{tr("Ask anything about your hospital flow.")}</p><button onClick={()=>setModal('assistant')}>{tr("Start a conversation")}<ArrowRight size={14}/></button></div><button className="nav-item" onClick={()=>toast(tr('Settings are up to date'))}><Settings size={18}/><span>{tr("Settings")}</span></button><div className="user-profile"><div className="avatar admin">AR</div><div className="user-info"><b>Alex Rivera</b><small>{tr("Hospital administrator")}</small></div><button className="icon-btn" onClick={()=>toast(tr('Signed in as Alex Rivera'))} aria-label={tr("Profile options")}><MoreHorizontal size={19}/></button></div></div>
</aside>
{mobileNav&&<div className="scrim" onClick={()=>setMobileNav(false)}/>}
<main className="main" id="main-content"><header className="topbar"><div className="top-left"><button className="icon-btn mobile-menu" onClick={()=>setMobileNav(true)} aria-label={tr("Open menu")}><Menu size={20}/></button><div className="breadcrumb">{tr('Workspace')}<ChevronRight size={14}/><b>{tr(active)}</b></div></div><div className="top-actions"><div className="live-pill"><span/>{tr('Live updates')}</div><button className="icon-btn theme-toggle" onClick={()=>setDark(!dark)} aria-label={tr('Toggle color theme')}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button><button className="accessibility-toggle" onClick={()=>setAccessibility(!accessibility)} aria-pressed={accessibility} title={tr('Toggle larger text and high contrast')}>A+</button><button className="icon-btn notification" onClick={openNotifications} aria-label={`${tr('Notifications')}${unreadNotifications?`,${unreadNotifications}${tr('unread')}`:''}`}><Bell size={18}/>{unreadNotifications>0&&<span className="unread-badge">{unreadNotifications>9?'9+':unreadNotifications}</span>}</button><div className="top-divider"/>{account?<button className="role-select" onClick={signOut} title={tr('Click to sign out')}><span className="avatar mini">{account.name.split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase()}</span><span>{tr(role)}·{tr('Sign out')}</span><LogOut size={14}/></button>:<><button className="role-select demo-role" onClick={()=>setRole(role==='Admin'?'Doctor':role==='Doctor'?'Patient':'Admin')}><span className="avatar mini">{role==='Admin'?'AR':role==='Doctor'?'MC':'AJ'}</span><span>{tr(role)}{tr("demo")}</span><ChevronDown size={14}/></button><button className="btn btn-secondary connect-btn" onClick={()=>{setAuthMode('login');setAuthError('');setModal('auth')}}>{tr('Sign in')}</button></>}</div></header>
<div className="content"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot"/>{new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}).toUpperCase()}</div><h1>{account?`${tr('Welcome')},${account.name.split(' ')[0]}`:role==='Admin'?tr('Good morning, Alex'):role==='Doctor'?tr('Good morning, Dr. Chen'):tr('Good morning, Amara')}<span className="wave">✳</span></h1><p>{account?`${tr(role)} account · ${tr('signed in securely')}`:role==='Admin'?tr('Here’s what’s happening across your hospital today.'):role==='Doctor'?tr('Here’s your schedule and queue for today.'):tr('Your care journey, all in one place.')}</p></div><div className="heading-actions"><button className="btn btn-secondary" onClick={()=>{const csv=['Token,Patient,Doctor,Department,Status',...queueRows.map(p=>`${p.id},${p.name},${p.doctor},${p.dept},${p.status}`)].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='mediflow-queue.csv';a.click();URL.revokeObjectURL(a.href);toast('Queue report downloaded')}}><Download size={16}/>{tr('Export report')}</button><button className="btn btn-primary" onClick={openAppointment}><Plus size={17}/>{tr('New appointment')}</button></div></div>
{active!=='Overview'&&<div className="view-banner"><div className="banner-icon"><Activity size={19}/></div><div><b>{tr(active)}</b><span>{tr("This interactive demo keeps your hospital overview in view. Use the queue controls below to explore live updates.")}</span></div><button className="text-btn" onClick={()=>setActive('Overview')}>{tr("Back to overview")}<ArrowRight size={14}/></button></div>}
{active==='Appointments'&&account&&<section className="card appointments-panel"><div className="appointments-panel-heading"><div><h2>{tr("Your appointments")}</h2><p>{tr("Appointments saved to your MediFlow account.")}</p></div><button className="btn btn-primary" onClick={openAppointment}><Plus size={15}/>{tr("Book appointment")}</button></div>{appointmentsLoading?<div className="appointment-message">{tr("Loading your appointments")}</div>:appointmentsError?<div className="auth-error appointment-error">{trDisplay(appointmentsError)}</div>:appointmentRecords.length===0?<div className="appointment-message">{tr("No appointments yet. Book one to get started.")}</div>:<div className="appointment-list">{appointmentRecords.map(item=><AppointmentRow tr={tr} key={item._id} item={item} queueEntry={liveQueue.find(entry=>String(entry.appointment?._id||entry.appointment)===String(item._id))} busy={queueBusyId===item._id} onCheckIn={checkInAppointment} onCancel={cancelAppointment}/>)}</div>}</section>}
<div className="metric-grid"><Metric title={tr(account?'Appointments today':'Patients today')} value={account?analytics?analytics.appointmentsToday:'—':'248'}change={analytics?`${analytics.waitingPatients} ${tr('waiting')}`:account?.role==='admin'?analyticsError?tr('Analytics unavailable'):tr('Loading live data'):account?tr('Admin view required'):'12.8%'}detail={tr(account?'scheduled for today':'vs. yesterday')}icon={Users}iconTone="teal"positive/><Metric title={tr("Avg. wait time")} value={analytics?`${analytics.averageWaitMinutes}<span>min</span>`:account?'—':'24<span> min</span>'}change={analytics?tr('queue estimate'):account?.role==='admin'?analyticsError?tr('Analytics unavailable'):tr('Loading live data'):account?tr('Admin view required'):'8.2%'}detail={tr(analytics?'operational estimate':account?'not available':'vs. yesterday')}icon={Clock3}iconTone="blue"positive/><Metric title={tr("Active doctors")} value={account?analytics?analytics.activeDoctors:'—':'18<span> / 22</span>'}change={analytics?tr('currently available'):account?.role==='admin'?analyticsError?tr('Analytics unavailable'):tr('Loading live data'):account?tr('Admin view required'):tr('4 on break')}detail={tr(analytics?'across departments':account?'not available':'2 joining soon')}icon={HeartPulse}iconTone="purple"/><Metric title={tr(account?'Patients in queue':'Appointments')} value={account?analytics?analytics.activeQueue:'—':'186'}change={analytics?`${analytics.waitingPatients} ${tr('waiting')}`:account?.role==='admin'?analyticsError?tr('Analytics unavailable'):tr('Loading live data'):account?tr('Admin view required'):tr('12 pending')}detail={tr(account?'active consultations included':'across 8 departments')}icon={CalendarDays}iconTone="orange"/></div>
<section className="mid-grid"><div className="card wait-card"><div className="card-heading"><div><h2>{tr("Patient flow")}</h2><p>{tr("Illustrative hourly data")}<span className="demo-inline">{tr("DEMO DATA")}</span></p></div><button className="period-select" onClick={()=>toast('Showing the illustrative patient-flow chart')}>{tr("Today")}<ChevronDown size={14}/></button></div><div className="chart-legend"><span><i className="legend-dot patients-dot"/>{tr("Patients")}</span><span><i className="legend-dot wait-dot"/>{tr("Avg. wait time")}</span></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{top:10,right:7,left:-23,bottom:0}}><defs><linearGradient id="patientsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#16b8a5" stopOpacity={0.18}/><stop offset="100%" stopColor="#16b8a5" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="35" vertical={false}stroke="var(--line)"/><XAxis dataKey="t"axisLine={false} tickLine={false} tick={{fill:'var(--muted)',fontSize:11}}dy={9}/><YAxis axisLine={false} tickLine={false} tick={{fill:'var(--muted)',fontSize:11}}/><Tooltip contentStyle={{borderRadius:12,border:'1px solid var(--line)',background:'var(--surface)',color:'var(--ink)',fontSize:12}}/><Area type="monotone" dataKey="patients"stroke="#15ad9d"strokeWidth={2.5}fill="url(#patientsFill)"/><Area type="monotone" dataKey="wait"stroke="#6e82d9"strokeWidth={2}strokeDasharray="54"fill="none"/></AreaChart></ResponsiveContainer></div><div className="chart-footer"><span><span className="footer-dot"/>{tr("Sample peak at")}<b>1:00PM</b></span><span>{tr("Demo dataset")}</span></div></div>
<div className="card radar-card"><div className="card-heading"><div><h2>{tr("Congestion radar")}</h2><p>{tr(account?.role==='admin'?'Hospital-wide queue load · live API':account?'Congestion analytics require admin access':'Illustrative department congestion · demo')}</p></div><button className="icon-btn" onClick={()=>analyticsError?toast(analyticsError):toast('Congestion data is current')} aria-label={tr("More radar options")}><MoreHorizontal size={19}/></button></div>{analyticsError&&account?.role==='admin'&&<div className="queue-error">{trDisplay(analyticsError)}</div>}<div className="radar-list">{radarDepartments.map(d=><div className="department" key={d.name}><div className={`dept-symbol ${d.color}`}>{d.icon}</div><div className="dept-main"><div className="dept-top"><b>{tr(d.name)}</b><span className={`level ${d.color}`}>{tr(d.level)}</span></div><div className="dept-bottom"><span>{d.count} {tr("waiting")}</span><i>·</i><span>{d.delay} {tr("estimated range")}</span></div><div className="progress"><i className={d.color}style={{width:`${d.pct}%`}}/></div></div><button className="icon-btn dept-more" onClick={()=>{setDept(d.name);toast(`${d.name} queue selected`)}} aria-label={`${tr('Filter by')}${tr(d.name)}`}><ChevronRight size={16}/></button></div>)}{radarDepartments.length===0&&<div className="radar-empty">{account?.role==='admin'?analyticsError?tr(analyticsError):tr('Loading department analytics…'):account?tr('Sign in with an administrator account to view hospital-wide congestion.'):tr('No demo departments.')}</div>}</div><button className="card-link" onClick={()=>{setActive('Departments');setDept('All departments')}}>{tr("View all departments")}<ArrowRight size={15}/></button></div></section>
<section className="card queue-card"><div className="queue-heading"><div><div className="queue-title"><h2>{tr("Live patient queue")}</h2><span className="queue-count">{queueRows.length} {tr("active")}</span><span className={`demo-tag ${account?'live-tag':''}`}>{tr(account?'LIVE API':'DEMO DATA')}</span></div><p>{tr(account?'Authorized queue entries · updates refresh automatically':'Track the clearly labelled demo queue and explore its controls')}</p></div><div className="queue-controls"><label className="search-box"><Search size={16}/><input placeholder={tr("Search patients...")} value={query} onChange={e=>setQuery(e.target.value)}/><kbd>⌘K</kbd></label><select className="filter-select" value={dept} onChange={e=>setDept(e.target.value)}><option value="All departments">{tr("All departments")}</option>{departmentNames.map(name=><option key={name} value={name}>{tr(name)}</option>)}</select><button className="icon-btn filter-btn" onClick={()=>{setDept('All departments');setQuery('');toast(tr('Clear filters'))}} aria-label={tr("Clear filters")}><Filter size={16}/></button></div></div>{account&&queueError&&<div className="queue-error" role="status">{trDisplay(queueError)}</div>}<div className="table-wrap"><table><thead><tr><th>{tr("PATIENT")}</th><th>{tr("QUEUE TOKEN")}</th><th>{tr("DOCTOR")}</th><th>{tr("APPOINTMENT")}</th><th>{tr("EST. WAIT")}</th><th>{tr("STATUS")}</th><th></th></tr></thead><tbody>{shown.map(p=><tr key={p.id}><td><div className="patient-cell"><div className={`avatar patient-avatar ${p.tone}`}>{p.initials}</div><b>{p.name}</b></div></td><td><span className="token">{p.id}</span></td><td><span className="doctor-name">{p.doctor}</span><small className="doctor-dept">{tr(p.dept)}</small></td><td><span className="appointment-time"><Clock3 size={14}/>{tr(p.time)}</span></td><td><b className="wait-time">{p.wait}</b><button className="prediction-link" onClick={()=>p.estimate?setSelectedEstimate(p.estimate):toast('Illustrative demo estimate; no prediction factors are stored.')}>{tr("Why this estimate?")}</button></td><td><button disabled={Boolean(queueBusyId)||(account&&!['doctor','admin'].includes(account.role))}className={`status ${p.status==='Waiting'?'waiting':p.status==='In consultation'?'consulting':p.status==='Completed'?'completed':' checked'}`} onClick={()=>updateStatus(p.queueId||p.id)} title={tr(account?(account.role==='patient'?'Queue status is managed by hospital staff':'Advance this consultation state'):'Click to advance demo queue status')}><i/>{queueBusyId===p.queueId?tr('Updating'):tr(p.status)}</button></td><td><button className="icon-btn row-more" onClick={()=>toast(`${p.name}·${p.id}`)} aria-label={`${tr('Actions for')} ${p.name}`}><MoreHorizontal size={18}/></button></td></tr>)}</tbody></table>{shown.length===0&&<div className="empty-state"><Search size={22}/><b>{tr(queueError&&account?'Queue unavailable':'No patients found')}</b><span>{tr(account?'There are no active entries visible to this account.':'Try another name or department.')}</span></div>}</div><div className="table-footer"><span>{tr("Showing")}<b>{shown.length}</b> {tr("of")} <b>{queueRows.length}</b> {tr("patients")}{!account&&<span className="demo-note">·{tr("Demo data for presentation")}</span>}</span>{!account&&<div className="pagination"><button disabled aria-label={tr("Previous page")}><ChevronLeft size={15}/></button><button className="current-page">1</button><button onClick={()=>toast(tr('All demo patients fit on one page'))}>2</button><button onClick={()=>toast(tr('All demo patients fit on one page'))}>3</button><span>…</span><button onClick={()=>toast(tr('All demo patients fit on one page'))}>8</button><button onClick={()=>toast(tr('All demo patients fit on one page'))} aria-label={tr("Next page")}><ChevronRight size={15}/></button></div>}</div></section>
<footer className="footer"><span>© 2026 MediFlow AI<span>·</span>{tr("Intelligent care, thoughtfully coordinated.")}</span><div><button onClick={()=>setModal('assistant')}><HelpCircle size={14}/>{tr("Help center")}</button><button onClick={()=>toast('Privacy controls are enabled for this demo')}><ShieldCheck size={14}/>{tr("Privacy")}</button><span className="version">v1.0.0 · Demo</span></div></footer>
</div></main>
{modal==='notifications'&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setModal('')}><div className="modal notifications-modal"><div className="modal-heading"><div><div className="modal-symbol"><Bell size={19}/></div><h2>{tr('Notifications')}</h2><p>{unreadNotifications?unreadNotifications+" "+tr("unread"):tr("You are all caught up")}</p></div><button className="icon-btn" onClick={()=>setModal('')} aria-label={tr('Close')}><X size={19}/></button></div>{notificationError&&<div className="auth-error">{trDisplay(notificationError)}</div>}{notificationItems.length===0?<div className="appointment-message">{tr('No notifications yet')}</div>:<div className="notification-list">{notificationItems.map(item=><button key={item._id}className={`notification-row ${item.readAt?'read':'unread'}`} onClick={()=>!item.readAt&&markNotificationRead(item._id)}><span className="notification-mark">{item.readAt?<Check size={14}/>:<Bell size={14}/>}</span><span className="notification-body"><b>{trDisplay(item.message)}</b><small>{new Date(item.createdAt).toLocaleString('en-US')}</small></span>{!item.readAt&&<i/>}</button>)}</div>}<div className="modal-actions notification-actions"><button className="link-button" disabled={!unreadNotifications} onClick={markAllNotificationsRead}><CheckCheck size={15}/>{tr('Mark all read')}</button><button className="btn btn-secondary" onClick={()=>setModal('')}>{tr('Close')}</button></div></div></div>}
{modal==='auth'&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setModal('')}><div className="modal"><div className="modal-heading"><div><div className="modal-symbol"><ShieldCheck size={19}/></div><h2>{tr(authMode==='login'?'Sign in to MediFlow':'Create a patient account')}</h2><p>{tr(authMode==='login'?'Use your hospital account credentials.':'Patient registration is open for this demo.')}</p></div><button className="icon-btn" onClick={()=>setModal('')} aria-label={tr("Close")}><X size={19}/></button></div><form onSubmit={submitAuth}>{authMode==='register'&&<label>{tr("Full name")}<input required autoFocus minLength={2} maxLength={80} autoComplete="name" placeholder={tr("e.g. Jamie Taylor")} value={authName} onChange={e=>setAuthName(e.target.value)}/></label>}<label>{tr("Email address")}<input required autoFocus={authMode==='login'} type="email" autoComplete="email" placeholder={tr("you@hospital.org")} value={authEmail} onChange={e=>setAuthEmail(e.target.value)}/></label><label>{tr("Password")}<input required type="password" minLength={authMode==='register'?10:1} autoComplete={authMode==='login'?'current-password':'new-password'} placeholder={tr(authMode==='register'?'At least 10 characters':'Your password')} value={authPassword} onChange={e=>setAuthPassword(e.target.value)}/></label>{authError&&<div className="auth-error" role="alert">{trDisplay(authError)}</div>}{!authError&&<div className="form-note"><ShieldCheck size={15}/><span>{tr("Credentials are sent to your configured API at")} {apiBaseUrl}.</span></div>}<div className="modal-actions auth-actions"><button type="button"className="link-button" onClick={()=>{setAuthMode(authMode==='login'?'register':'login');setAuthError('')}}>{tr(authMode==='login'?'Create patient account':'I already have an account')}</button><button type="submit" disabled={authBusy||authLoading}className="btn btn-primary">{authBusy?tr('Please wait'):tr(authMode==='login'?'Sign in':'Create account')}<ArrowRight size={15}/></button></div></form></div></div>}
{modal==='appointment'&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setModal('')}><div className="modal"><div className="modal-heading"><div><div className="modal-symbol"><CalendarDays size={19}/></div><h2>{account?tr('Book an appointment'):tr('Demo appointment')}</h2><p>{tr(account?'Choose a department, doctor, and preferred time.':'Add a clearly labelled example to the local demo queue.')}</p></div><button className="icon-btn" onClick={()=>setModal('')} aria-label={tr("Close")}><X size={19}/></button></div>{account?<form onSubmit={submitBooking}><label>{tr("Department")}<select required value={bookingDepartmentId} onChange={e=>{setBookingDepartmentId(e.target.value);const nextDoctor=bookingDoctors.find(d=>String(d.department?._id)===e.target.value);setBookingDoctorId(nextDoctor?._id||'')}} disabled={bookingLoading}><option value="">{tr("Choose a department")}</option>{bookingDepartments.map(d=><option key={d._id} value={d._id}>{tr(d.name)}</option>)}</select></label><label>{tr("Doctor")}<select required value={bookingDoctorId} onChange={e=>setBookingDoctorId(e.target.value)} disabled={bookingLoading||!doctorOptions.length}><option value="">{bookingLoading?tr('Loading doctors'):doctorOptions.length?tr('Choose a doctor'):tr('No available doctors')}</option>{doctorOptions.map(d=><option key={d._id} value={d._id}>{d.user?.name}{d.specialization?`·${tr(d.specialization)}`:''}</option>)}</select></label><label>{tr("Preferred appointment time")}<input required type="datetime-local"min={localDateTime(new Date())} value={bookingStartsAt} onChange={e=>setBookingStartsAt(e.target.value)}/></label><div className="suggested-slots"><div className="slot-header"><b>{tr("Recommended open times")}</b><span>{tr("Workload-balanced suggestions")}</span></div>{slotLoading?<p className="slot-message">{tr("Checking availability")}</p>:slotSuggestions.length?<div className="slot-options">{slotSuggestions.map(slot=>{const value=localDateTime(new Date(slot.startsAt));return <button type="button" key={slot.startsAt}className={bookingStartsAt===value?'slot-option selected':'slot-option'} onClick={()=>setBookingStartsAt(value)}><b>{new Date(slot.startsAt).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</b><small>{tr(slot.workload)} {tr("load")}</small></button>})}</div>:<p className="slot-message">{trDisplay(slotNote||"No recommendations for this date. Choose another date.")}</p>}{slotNote&&slotSuggestions.length>0&&<p className="slot-footnote">{trDisplay(slotNote)}</p>}</div><label>{tr("Reason for visit")}<span className="optional-label">{tr("(optional)")}</span><textarea maxLength={400} rows={3} placeholder={tr("Briefly describe what you need help with")} value={bookingReason} onChange={e=>setBookingReason(e.target.value)}/></label>{bookingLoading&&<div className="form-note"><Activity size={15}/><span>{tr("Loading current departments and available doctors")}</span></div>}{bookingError&&<div className="auth-error" role="alert">{trDisplay(bookingError)}</div>}<div className="form-note"><Clock3 size={15}/><span>{tr("Recommendations are suggestions. Booking still checks for conflicts.")}</span></div><div className="modal-actions"><button type="button"className="btn btn-secondary" onClick={()=>setModal('')}>{tr("Cancel")}</button><button type="submit" disabled={bookingBusy||bookingLoading||!bookingDoctorId}className="btn btn-primary">{bookingBusy?tr('Booking…'):tr('Confirm appointment')}<ArrowRight size={15}/></button></div></form>:<form onSubmit={submitBooking}><label>{tr("Patient name")}<input required autoFocus placeholder={tr("e.g. Jamie Taylor")} value={formName} onChange={e=>setFormName(e.target.value)}/></label><label>{tr("Department")}<select value={formDept} onChange={e=>{setFormDept(e.target.value);setFormDoctor(e.target.value==='Neurology'?'Dr. James Park':e.target.value==='Pediatrics'?'Dr. Elena Garcia':'Dr. Maya Chen')}}>{departments.map(d=><option key={d.name} value={d.name}>{tr(d.name)}</option>)}</select></label><label>{tr("Doctor")}<select value={formDoctor} onChange={e=>setFormDoctor(e.target.value)}><option>Dr. Maya Chen</option><option>Dr. James Park</option><option>Dr. Elena Garcia</option></select></label><div className="form-note"><Sparkles size={15}/><span>{tr("This only adds a sample row to the local demo queue.")}</span></div><div className="modal-actions"><button type="button"className="btn btn-secondary" onClick={()=>setModal('')}>{tr("Cancel")}</button><button type="submit"className="btn btn-primary"><Plus size={16}/>{tr("Add demo entry")}</button></div></form>}</div></div>}
{selectedEstimate&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setSelectedEstimate(null)}><div className="modal"><div className="modal-heading"><div><div className="modal-symbol"><Clock3 size={19}/></div><h2>{tr("How this wait is estimated")}</h2><p>{tr("Explainable baseline")} · {tr(selectedEstimate.confidence||'limited')}{tr("confidence")}</p></div><button className="icon-btn" onClick={()=>setSelectedEstimate(null)} aria-label={tr("Close")}><X size={19}/></button></div><div className="estimate-range"><b>{selectedEstimate.low}–{selectedEstimate.high} min</b><span>{tr("Estimated range, not a guaranteed wait time")}</span></div><div className="estimate-factors"><b>{tr("Factors used")}</b>{(selectedEstimate.factors||[]).map((factor,index)=><div key={`${factor}-${index}`}><span>{index+1}</span>{factor}</div>)}{selectedEstimate.sampleCount!==undefined&&<small>{tr("Historical consultation sample")}: {selectedEstimate.sampleCount}.{tr("This estimate has not been validated as a clinical or operational performance model.")}</small>}</div><div className="modal-actions"><button className="btn btn-secondary" onClick={()=>setSelectedEstimate(null)}>{tr("Close")}</button></div></div></div>}
{modal==='assistant'&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setModal('')}><div className="modal assistant-modal"><div className="modal-heading"><div><div className="modal-symbol assistant-symbol"><Sparkles size={19}/></div><h2>{tr("MediFlow assistant")}</h2><p>{tr("Helpful guidance for navigating hospital flow.")}</p></div><button className="icon-btn" onClick={()=>setModal('')} aria-label={tr("Close")}><X size={19}/></button></div><div className="assistant-response"><div className="assistant-bubble">{tr("Hello! I can help you explore the dashboard, queue, and wait estimates.")}</div><div className="suggestions"><button onClick={()=>{setModal('');setDept('Pediatrics');toast('Showing Pediatrics queue')}}>{tr("Show Pediatrics queue")}</button><button onClick={()=>{setModal('');setActive('Analytics')}}>{tr("Explain wait estimates")}</button></div></div><div className="form-note"><ShieldCheck size={15}/><span>{tr("I can help with hospital navigation and queue information, but I cannot provide diagnosis or treatment advice.")}</span></div></div></div>}
{notice&&<div className="toast"><span><Check size={15}/></span>{notice}</div>}
</div>
}
function Metric({title,value,change,detail,icon:Icon,iconTone,positive}){return <div className="card metric-card"><div className="metric-top"><span>{title}</span><div className={`metric-icon ${iconTone}`}><Icon size={18}/></div></div><div className="metric-value"dangerouslySetInnerHTML={{__html:value}}/><div className="metric-bottom"><span className={positive?'trend positive':'trend neutral'}>{positive?<ArrowDownRight size={13}/>:<span className="tiny-dot"/>}{change}</span><span>{detail}</span></div></div>}

function AppointmentRow({item,queueEntry,busy,onCheckIn,onCancel,tr}){
return <div className="appointment-record"><div className="appointment-record-icon"><CalendarDays size={17}/></div><div className="appointment-record-main"><b>{item.doctor?.user?.name||tr('Doctor')}</b><span>{item.department?.name?tr(item.department.name):tr('Department')} · {new Date(item.startsAt).toLocaleString('en-US')}</span></div><span className={`record-status ${item.status}`}>{tr(item.status)}</span>{item.status==='booked'&&<button className="btn btn-primary small-action" disabled={busy} onClick={()=>onCheckIn(item._id)}>{busy?tr('Checking in'):tr('Check in')}</button>}{['booked','checked-in'].includes(item.status)&&<button className="cancel-link" disabled={busy} onClick={()=>onCancel(item._id)}>{tr("Cancel")}</button>}{queueEntry&&<div className="queue-pass"><div className="pass-qr"><QRCodeSVG value={`MEDIFLOW-QUEUE:${queueEntry.token}`} size={58} level="M" includeMargin/></div><div className="pass-copy"><span className="pass-label">{tr("DIGITAL QUEUE PASS")}</span><b>{queueEntry.token}</b><span>{tr("Estimated wait")} {queueEntry.estimate?.low??0}–{queueEntry.estimate?.high??0} min ·{tr("estimate only")}</span></div></div>}</div>
}

export default App
