# MediFlow AI â€” Intelligent Hospital Queue & Appointment Optimizer

A college WAD project foundation for hospital appointment coordination. The repository currently contains a polished, responsive React dashboard and a separately runnable Express/MongoDB API foundation. The interface labels its bundled queue data as demo data. No validated predictive model or production healthcare integration is claimed.

## Current implementation

- **Frontend:** React + Vite, responsive admin overview, patient queue table, department congestion view, patient-flow chart, theme switch, demo role-view switch, appointment form, demo queue status transitions, CSV export, assistant safety boundary, and login/patient registration connected to the API.
- **API:** Express, MongoDB/Mongoose models, bcrypt password hashes, 12-hour JWTs, role authorization, doctor/department discovery, workload-aware slot recommendations, appointment booking/cancellation, check-in token creation, queue transitions, explainable baseline wait estimates, notification retrieval, admin congestion analytics, audit entries, and authenticated Socket.IO department rooms.
- **Privacy/safety:** The assistant does not diagnose or recommend treatment. Wait times are explicitly estimates. Clinical triage is not automated. Demo names in the frontend are synthetic.

Authentication, patient appointment booking, and core queue workflows are connected to the API. After login the account name and role come from the server, and the JWT is kept in `sessionStorage` for the browser tab and checked on reload. Registration creates patient accounts only. Signed-in patients can load available departments/doctors, view workload-ranked open time suggestions, request a slot, view/cancel a saved appointment, check in, and view a QR queue pass with an explainable wait range. Authenticated queue data refreshes over Socket.IO. Patients see only their queue entries; doctors see their own queue; administrators can monitor across departments. Socket room joins are checked against these role scopes. Admin summary metrics and congestion radar use API data; the patient-flow chart and signed-out dashboard remain clearly labelled demo data. In-app notifications are available for booking, cancellation, check-in, and consultation state changes. The interface and all user-facing text remain in English. Accessibility controls include larger text and high-contrast focus. Email alerts, a fuller doctor portal, rescheduling, transaction-safe overlapping-slot reservations, and the simulation lab remain to be implemented. `PatientProfile`, `HospitalSettings`, and parts of schedules/notifications are model foundations whose full workflows are not yet exposed.

## Requirements

See [DEPLOYMENT.md](./DEPLOYMENT.md) for hosting configuration and a release checklist.

- Node.js 20 or newer
- MongoDB 7+

## Run the frontend

From the repository root:

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env` if the API is running at a non-default address; set `VITE_API_URL` to its origin. Vite prints a local URL (normally `http://localhost:5173`). The dashboard opens with clearly identified demo queue data. Use **Sign in** to authenticate against the API or create a patient account. Use **New appointment** to add a demo queue row; click a status chip to advance its demo state; search/filter the table; use **Export report** to download CSV.

## Run the API

In a second terminal:

```sh
cd server
npm install
```

Copy `server/.env.example` to `server/.env`, set a MongoDB URI and a random JWT secret of at least 32 characters, then run:

```sh
npm run seed
npm run dev
```

The seed command creates departments, three doctor records, and admin/patient/doctor demo accounts. Demo password: `MediFlowDemo!2026`. Do not reuse this password outside local demonstrations. API health check: `GET http://localhost:4000/api/health`.

## API outline

All protected routes use `Authorization: Bearer <token>`.

| Method | Route | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Patient registration |
| POST | `/api/auth/login` | Public | Login and JWT issuance |
| GET | `/api/auth/me` | Signed in | Current account |
| GET | `/api/departments` | Public | Department list |
| GET | `/api/doctors` | Public | Available doctors; optional `?department=<id>` |
| GET | `/api/doctors/:id/recommendations?date=YYYY-MM-DD` | Patient | Up to eight open time suggestions ranked by nearby bookings and queue load |
| POST | `/api/appointments` | Patient | Book an available doctor/time |
| GET | `/api/appointments` | Signed in | Paginated appointment list |
| PATCH | `/api/appointments/:id/cancel` | Owner, doctor, admin | Cancel an active appointment |
| POST | `/api/appointments/:id/check-in` | Owner, doctor, admin | Check in and receive queue token/estimate |
| GET | `/api/queue` | Signed in | Queue entries visible to current role |
| GET | `/api/queue/:id/prediction` | Owner, doctor, admin | Explainable wait estimate |
| PATCH | `/api/queue/:id/status` | Doctor, admin | Update consultation state |
| GET | `/api/notifications` | Signed in | Current user's notifications |
| PATCH | `/api/notifications/:id/read` | Signed in | Mark one owned notification as read |
| PATCH | `/api/notifications/read-all` | Signed in | Mark current user's notifications as read |
| GET | `/api/admin/analytics` | Admin | Department and appointment totals |

Socket.IO clients authenticate with `auth: { token }`, then emit `queue:join` with a department id to receive `queue:changed` events for that department.

## Wait-estimate baseline

The API uses an explainable baseline. It counts earlier checked-in patients and earlier same-day bookings not yet checked in, uses completed consultation durations once at least five samples exist (otherwise it uses the doctor's configured duration), accounts for elapsed time in a current consultation, and adds a delay for a registered active break/unavailable schedule. Queue status transitions record consultation start/end and actual duration. Predictions return an estimated range, confidence label, sample count, method, and factor list. Confidence remains limited below ten completed samples and is capped at moderate until a model is evaluated. This is not a validated prediction model; no representative sample dataset, trained regression model, or MAE evaluation is included.

## Suggested build phases

1. UI foundation and navigation (implemented with local demo interactions).
2. API, database models, and configuration (foundation implemented; requires local MongoDB to run).
3. Authentication/roles (API endpoints implemented; connect frontend forms and route guards).
4. Doctor discovery and booking (API-backed discovery, patient booking/list/cancellation, workload-ranked open slots, and overlap conflict checks implemented; transaction-safe slot reservations remain).
5. Queue/check-in/realtime (patient check-in, unique department/day token counter, QR queue pass, role-scoped live queue, and Socket.IO refresh implemented; concurrency and live integration still require runtime verification).
6. Explainable wait-time baseline (configured/historical duration, queue position, current consultation progress, same-day earlier bookings, schedule breaks, and factor display implemented; add representative data and MAE evaluation before any ML claims).
7. Scheduling/congestion analytics (workload-ranked appointment suggestions and API-backed live admin department radar/metrics implemented; simulation lab and historical flow charts remain).
8. Notifications and accessibility (in-app notifications and accessibility controls implemented; automated tests remain to be written).
9. Deployment notes added in `DEPLOYMENT.md`; automated tests remain to be written and run.

## Project explanation / viva notes

Phase 8 adds authenticated in-app notifications for booking, cancellation, check-in, and consultation start/completion. Notifications appear in the bell menu, support per-item and mark-all read actions, and arrive over the authenticated user socket room. Accessibility controls include a skip link, larger text, and high-contrast focus mode. The interface, notifications, and all other user-facing text remain in English. Email notifications are not implemented.

MediFlow separates the presentation layer (React), application layer (Express and Socket.IO), and data layer (MongoDB). A patient books an appointment; an authorized check-in creates a queue entry with a department-scoped token; queue changes are broadcast only to clients authenticated to the socket server and joined to that department. The baseline estimate shows the count and consultation-duration factors rather than presenting an opaque medical decision. Access is role-gated, password hashes are stored instead of plaintext passwords, and patient queue lookup is restricted to the authenticated patient. Clinical urgency remains with qualified staff.

## Verification status

Frontend dependencies are installed and `npm run build` succeeds. Root and server dependency trees were checked with `npm ls --depth=0`. The API process starts locally; the health endpoint and database-backed workflows still need runtime verification against a configured MongoDB instance. No automated test script is defined yet. Automated auth, booking-conflict, token-concurrency, prediction, API-error, and responsive-layout tests still need to be written.

### Manual queue walkthrough

1. Sign in as a patient, book a future appointment, then open **Appointments**.
2. Choose **Check in** on a booked appointment. The API should return a department/day queue token and estimate; the appointment row should show a QR queue pass and estimated wait range.
3. The **Live patient queue** table should show the signed-in patient's authorized entry, labelled `LIVE API`.
4. Sign in as the assigned doctor in another browser session. That doctor should see only their own department queue; advancing a row to consultation should refresh the patient's queue state over Socket.IO.
5. A different patient should not see the first patient's queue entry or be allowed to subscribe to its department room unless they have an active entry there.
6. In the booking form, change the date or doctor. Open time recommendations should reload and show a workload label; selecting one fills the requested time. Booking rechecks for overlapping appointments and reports a conflict if another booking occupies that interval.
7. Sign in with the seeded admin account. The summary cards and congestion radar should use current API counts and refresh every 30 seconds. The hourly patient-flow chart is still labelled demo data.
8. As a doctor, start and complete several consultations. Once at least five completed durations exist, new estimates use the historical average; before that, they use the configured duration. **Why this estimate?** lists the contributing factors and sample count.

