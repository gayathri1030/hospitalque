# Deployment notes

MediFlow is a project prototype. Deploy it only for a demo with synthetic records. It has not been security-reviewed or validated for real patient data or clinical operations.

## Services

Deploy the Vite frontend as a static site and the Express API as a persistent Node.js service. Use a managed MongoDB database reachable from the API service. The frontend and API may use different hostnames, but both must use HTTPS in a public deployment.

## Frontend

1. Set the build environment variable `VITE_API_URL` to the public API origin, for example `https://api.example.org` (no `/api` suffix).
2. Install the root dependencies and run `npm run build`.
3. Publish the generated `dist/` directory with SPA fallback to `index.html` for client-side routes.

### GitHub Pages project site

This repository uses the `/hospitalque/` Vite base path. The `.github/workflows/deploy.yml` workflow runs `npm ci` and `npm run build` on pushes to `main`, then deploys `dist/` with GitHub Pages. In repository **Settings → Pages**, select **GitHub Actions** as the source. For API-backed features, set the Actions repository variable `VITE_API_URL` to the deployed HTTPS API origin, and configure API `CLIENT_ORIGIN` as `https://gayathri1030.github.io`. Do not store credentials or secrets in `VITE_*` variables; they are included in the public frontend bundle.

Vite embeds `VITE_*` values in the browser bundle. Do not put secrets in frontend environment variables.

## API

Configure these environment variables on the API service:

| Variable | Production value |
|---|---|
| `PORT` | Port provided by the hosting service |
| `MONGODB_URI` | Private connection URI for the managed database |
| `JWT_SECRET` | Unique random secret with at least 32 characters |
| `CLIENT_ORIGIN` | Exact public frontend origin, including `https://` and no trailing path |

Install `server/` dependencies and use `npm start`. Allow outbound database access from the API host and inbound HTTPS traffic at the host's proxy. The API and Socket.IO share the same HTTP server; the proxy must allow WebSocket upgrades. Check `GET /api/health` after deployment.

Do not run `npm run seed` against a public or production database: it creates demo accounts with a documented demo password. Seed only a dedicated local/demo database, and replace all sample credentials before a presentation.

## Release checklist

- Confirm the frontend build points to the deployed API origin and the API CORS origin matches the frontend exactly.
- Confirm browser sign-in, appointment booking, check-in, queue updates, and notification delivery across two sessions.
- Confirm the hosting proxy supports WebSockets and HTTPS, then inspect `/api/health` and service logs.
- Use synthetic accounts and data only. Wait estimates are unvalidated operational estimates, not guaranteed service times or clinical triage.
- No automated test suite or production security review is included in this repository.
