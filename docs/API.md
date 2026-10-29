# API Quick Reference

Base URL in local development: `http://localhost:4000/api` (the Vite app proxies `/api`). Production URL: the deployed app origin + `/api`.

## Session and CSRF
1. `GET /auth/csrf` returns `{ "csrfToken": "..." }` and sets a readable CSRF cookie.
2. `POST /auth/login` or `POST /auth/register` sets an HttpOnly `access_token` cookie.
3. For authenticated `POST`, `PUT`, `PATCH`, and `DELETE`, send `X-CSRF-Token` equal to the CSRF cookie token.
4. The frontend's `api.js` wrapper handles this automatically. Postman must retain cookies and add the header for authenticated mutations.

## Endpoints

| Method | Path | Access |
|---|---|---|
| GET | `/health` | Public |
| GET | `/auth/csrf` | Public |
| POST | `/auth/register` | Public; creates CITIZEN only |
| POST | `/auth/login` | Public, rate limited |
| POST | `/auth/logout` | Session/CSRF |
| GET | `/auth/me` | Authenticated |
| POST | `/auth/forgot-password` | Public, rate limited |
| POST | `/auth/reset-password` | Public, time-limited token |
| GET | `/categories` | Public |
| GET | `/departments` | Public |
| POST | `/complaints` | CITIZEN |
| GET | `/complaints?page=1&limit=20&status=IN_PROGRESS&q=road` | Scoped by caller role |
| GET | `/complaints/:id` | Owner, assigned department, or ADMIN |
| PUT | `/complaints/:id` | Owning CITIZEN; SUBMITTED only |
| POST | `/complaints/:id/attachments` | Authorized user; multipart field `images` |
| GET | `/attachments/:id/file` | Complaint owner, assigned department, or ADMIN; private image delivery |
| PATCH | `/complaints/:id/status` | ADMIN or assigned DEPARTMENT |
| POST | `/complaints/:id/assign` | ADMIN |
| GET | `/admin/dashboard` | ADMIN |
| GET | `/admin/analytics` | ADMIN |
| GET | `/admin/users?limit=50&q=ana` | ADMIN |
| PATCH | `/admin/users/:id/active` | ADMIN |
| GET | `/admin/departments` | ADMIN |
| POST | `/admin/departments` | ADMIN |
| PATCH | `/admin/departments/:id` | ADMIN |
| PUT | `/admin/complaints/:id/assign-department` | ADMIN |
| PUT | `/admin/complaints/:id/update-status` | ADMIN |
| GET | `/department/dashboard` | DEPARTMENT |
| GET | `/notifications` | Authenticated; own notifications only |
| PATCH | `/notifications/:id/read` | Authenticated; own notification only |
| PATCH | `/notifications/read-all` | Authenticated |

## Complaint creation example

`POST /complaints`

```json
{
  "title": "Broken streetlight near community park",
  "description": "The streetlight has been off for several nights and the footpath is difficult to use after sunset.",
  "categoryId": "<category-uuid-from-GET-categories>",
  "address": "Near Community Park gate, Model Town",
  "ward": "Ward 12",
  "priority": "NORMAL"
}
```

## Assignment example

`PUT /admin/complaints/:id/assign-department`

```json
{
  "departmentId": "<department-uuid-from-GET-admin-departments>",
  "note": "Please inspect during the next ward visit."
}
```

## Status update example

`PATCH /complaints/:id/status`

```json
{
  "status": "RESOLVED",
  "resolutionNote": "The damaged streetlight was repaired and tested.",
  "note": "Field team confirmed the repair."
}
```

Complaint evidence is not exposed through a public `/uploads` directory. The API returns a protected `/api/attachments/:id/file` URL and checks role/ownership before serving local images or issuing a short-lived Cloudinary authenticated download URL. The current status must allow the target transition. Department officers can only progress complaints assigned to their own department. Rejection requires `rejectionReason`; resolution requires `resolutionNote` or `note`.

## Error response

```json
{ "message": "A resolution note is required." }
```

Use status codes as documented in SRS Section 9.7. Never use client-side hiding as a substitute for endpoint authorization.
