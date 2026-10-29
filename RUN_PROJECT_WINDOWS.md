# Run the Citizen Grievance Portal on Windows

## Prerequisites
- Node.js 24.x and npm.
- Docker Desktop running.
- At least 3-5 GB free disk space for dependency installation.

## First-time setup (Command Prompt)
Open CMD in the folder containing the root `package.json`, then run:

```cmd
copy .env.example .env
copy .env.example backend\.env
docker compose up -d postgres
npm install
npm run db:init
npm run seed
npm run dev
```

Open `http://localhost:5173`. The API health endpoint is `http://localhost:4000/api/health`.

If the `copy` command says the destination already exists, keep your existing environment file and verify its settings instead of overwriting secrets.

## If you previously saw ENOSPC, missing es-toolkit files, or missing caniuse-lite files
1. Press Ctrl+C to stop development servers.
2. Ensure the drive has several GB free.
3. Delete only the root `node_modules` directory. Do not delete `frontend`, `backend`, `database`, `docs`, or source files.
4. Run `npm cache verify`, then `npm install` at the root.
5. If npm says install scripts are pending, run `npm install-scripts approve esbuild sharp` followed by `npm rebuild esbuild sharp`.
6. Start again with `npm run dev`.

The admin analytics use native SVG/CSS charts; Recharts is not required by this version. The archive does not include `node_modules`; packages are installed locally by npm.
