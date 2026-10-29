# CivicConnect — Citizen Grievance Reporting and Resolution Portal

A full-stack reference implementation for reporting and tracking civic issues such as damaged roads, water supply problems, blocked drainage, garbage collection, streetlights, and sanitation. The project is suitable for an academic major project or software-engineering portfolio. It is a reference implementation, not a certified government service.

## Features

- Citizen registration, login, logout, and password reset flow.
- Admin and department roles with server-side role checks.
- Complaint submission with category, description, address/ward, optional coordinates, and image attachments.
- Citizen history, complaint detail timeline, status badges, and in-app notifications.
- Administrator dashboard, charts, department assignment, user activation/deactivation, and department management endpoints.
- Department work queue and progress/resolution updates.
- PostgreSQL relational schema, status history, assignment history, audit log, indexes, and analytics queries.
- JWT session in an HttpOnly cookie, CSRF double-submit check, bcrypt password hashing, Zod validation, rate limiting, Helmet headers, parameterized SQL, image decoding/compression.
- Optional Cloudinary, SMTP email, and Twilio SMS integration points.
- Responsive React/Vite frontend, Node/Express API, Docker PostgreSQL, test workflow, and GitHub Actions CI.

## Technology stack

- Frontend: React 19, Vite, React Router, Lucide icons, custom SVG/CSS analytics charts, responsive CSS.
- Backend: Node.js 24 LTS+, Express 5, Zod, bcryptjs, JWT, Sharp, Nodemailer, optional Cloudinary/Twilio.
- Database: PostgreSQL 17+ with UUID keys, foreign keys, indexes, `JSONB` audit metadata, and `TIMESTAMPTZ` timestamps.
- DevOps: Docker Compose for local PostgreSQL; GitHub Actions checks; single-origin deployment recommended for cookie-based sessions.

## Architecture

```text
Browser (React)
  | HTTPS / JSON or multipart
  v
Express REST API -- auth / RBAC / CSRF / validation / rate limiting
  |                    |              |
  v                    v              v
PostgreSQL          Private image    SMTP / SMS
(users, reports,    storage (signed  (optional)
 statuses, audit)    delivery / local API gate)
```

Diagram sources and images are in `docs/`. The complete SRS is in [`SRS.md`](SRS.md); the API reference is [`docs/API.md`](docs/API.md).

## Requirements

- Node.js 24 LTS or a supported LTS release compatible with the current dependencies.
- npm.
- Docker Desktop for the simplest local PostgreSQL setup (or a local PostgreSQL 17+ server).
- Optional Cloudinary/SMTP/Twilio credentials for external providers.

## Installation and local usage

### 1. Configure the environment

**PowerShell:**

```powershell
Copy-Item .env.example .env
Copy-Item .env.example backend\.env
```

**Command Prompt:**

```cmd
copy .env.example .env
copy .env.example backend\.env
```

The backend workspace starts with `backend` as its working directory, so it reads `backend/.env`. Keep the two files aligned for local development; never commit real secrets.

Review `.env`, especially `DATABASE_URL` and `JWT_SECRET`. Do not commit the real `.env` file.

### 2. Start PostgreSQL

With Docker Desktop running:

```bash
docker compose up -d postgres
```

The default local connection is:

```text
postgresql://postgres:postgres@localhost:5432/citizen_grievance
```

These defaults are for local development only.

### 3. Install dependencies and initialize

Run the commands from the project root (the folder containing the root `package.json`). For a fresh extraction, install dependencies once:

```bash
npm install
npm run db:init
npm run seed
```

On recent npm versions, install scripts for native/build tools may be held for review. The root `package.json` explicitly approves the required `esbuild` and `sharp` scripts. If npm still reports them as pending, run `npm install-scripts approve esbuild sharp`, then `npm rebuild esbuild sharp`.

**Repairing an incomplete install:** If a previous install failed with `ENOSPC`, do not keep retrying over the same partial `node_modules` directory. Make sure the drive has several GB free, then run `rmdir /s /q node_modules` in Windows Command Prompt (or remove the root `node_modules` folder in File Explorer), and run `npm install` again from the root. This project archive intentionally excludes `node_modules` so each machine installs clean native packages for its platform. Do not delete source folders or `.env` files when cleaning dependencies.

`npm run db:init` runs `database/schema.sql` to create the tables, indexes, and reference lookup rows. `npm run seed` creates demo administrator and department accounts using values from `.env`.

### 4. Start frontend and backend

```bash
npm run dev
```

Open the frontend at `http://localhost:5173`. The Vite proxy sends `/api` requests to the backend at `http://localhost:4000`. Complaint images are served through an authorization-checked API route, not from a public `/uploads` directory.

Health endpoint: `http://localhost:4000/api/health`.

### Demo accounts (development only)

- Admin: `admin@civicportal.local` / `AdminDemo123!`
- Department: `department@civicportal.local` / `DeptDemo123!`
- Citizen: register from the interface.

Do not use these credentials in a public deployment. Replace passwords, remove demo data, and configure a secret manager before deployment.

## Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | Backend HTTP port; default 4000 |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | High-entropy session signing secret; keep private |
| `JWT_EXPIRES_IN` | Session lifetime, default 8h |
| `FRONTEND_ORIGIN` | Comma-separated allowed browser origins for development/deployment |
| `COOKIE_SECURE` | Set `true` when serving over HTTPS |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Optional persistent image storage |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Optional email notifications |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Optional SMS notifications |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Development seed administrator |
| `SEED_DEPT_EMAIL`, `SEED_DEPT_PASSWORD` | Development seed department officer |
| `PUBLIC_APP_URL` | Base URL used in password-reset emails |

## API documentation

See [`docs/API.md`](docs/API.md). Core endpoints include:

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`
- `GET /api/complaints`, `POST /api/complaints`, `GET /api/complaints/:id`
- `POST /api/complaints/:id/attachments`
- `PATCH /api/complaints/:id/status`
- `GET /api/admin/dashboard`, `GET /api/admin/analytics`
- `PUT /api/admin/complaints/:id/assign-department`
- `GET /api/department/dashboard`
- `GET /api/notifications`

For browser sessions, the frontend automatically retrieves a CSRF token and sends it on mutating requests. API tools should retain cookies and send `X-CSRF-Token` on authenticated unsafe methods.

## Testing

Run workflow unit tests:

```bash
npm test
```

Run a manual health check:

```bash
curl http://localhost:4000/api/health
```

For end-to-end evaluation, test citizen ownership boundaries, department scope, required rejection/resolution notes, invalid transitions, expired reset tokens, uploads, CSRF, and rate limiting. The SRS contains a sample test matrix. A complete production test programme should add integration tests against an isolated PostgreSQL database, Playwright UI tests, and load/security testing.

## Deployment

For a simple hosted demo, deploy the combined Node service so Express serves `frontend/dist` and the API under one HTTPS origin. Provision PostgreSQL separately and configure `DATABASE_URL`; configure Cloudinary/S3 for durable image storage. Set `NODE_ENV=production`, a strong `JWT_SECRET`, `COOKIE_SECURE=true`, and the correct `FRONTEND_ORIGIN`. The host build command is `npm install && npm run build`; a simple academic start command is `npm run db:init && npm start`. Replace startup schema initialization with a versioned migration process for a production service.

If deploying frontend and backend separately, configure exact CORS origins and carefully verify secure cookie/domain and CSRF behavior. Avoid relying on local disk for uploaded images in environments with ephemeral filesystems.

## Screenshots

Add demo screenshots here after running the app. Use synthetic complaint information and do not publish real residents' addresses, phone numbers, or photos.

- `docs/screenshots/home.png`
- `docs/screenshots/citizen-dashboard.png`
- `docs/screenshots/new-complaint.png`
- `docs/screenshots/complaint-timeline.png`
- `docs/screenshots/admin-dashboard.png`
- `docs/screenshots/department-dashboard.png`

## Folder structure

```text
citizen-grievance-portal/
├── backend/          # Express API, auth, workflow, storage, notifications
├── frontend/         # React/Vite UI
├── database/         # PostgreSQL schema and seed SQL
├── docs/             # API reference and architecture diagrams
├── SRS.md            # Full software requirements specification
├── docker-compose.yml
└── .github/workflows/ci.yml
```

## Security and privacy notes

- `.env` is ignored by Git. Never commit API keys, database passwords, JWT secrets, real complaints, or production exports.
- Public registration cannot assign privileged roles.
- Local development uploads are stored under `backend/uploads` and are not exposed as a public static directory; each file request is checked against the complaint's authorized roles. For production, use durable private storage and a retention/access policy.
- The implementation is an academic starting point. Before serving real citizens, add formal privacy impact review, security testing, durable private file storage, backups/restore drills, observability, defined retention, and an incident-response plan.
- OAuth/OIDC, AI classification, GIS map rendering, and formal SLA enforcement are architectural extension points, not assumed to be already active.

## Contributors

Add project contributors, advisor, and institution here. Do not imply the project is officially endorsed by a government agency without written permission.

## License

Choose a license appropriate for your project and institution. If publishing it publicly, MIT is a common permissive option, but ensure all dependencies and assets comply with their own licenses before adding a `LICENSE` file.
