# User & Project CRUD API

Base URL: `http://localhost:3000` (dev) — set via `APP_BASE_URL`.

## Authentication

All endpoints require `Authorization: Bearer <CRUD_API_KEY>` header.

Set `CRUD_API_KEY=<your-secret>` in your `.env` / `.env.local` file.

Error when missing or wrong key:
```json
{ "ok": false, "error": { "code": "UNAUTHORIZED", "message": "Invalid API key.", "details": null } }
```

---

## Users

### POST /api/v1/users — Create user

**Request body**

| Field | Required | Type | Notes |
|---|---|---|---|
| email | yes | string | Valid email format, unique |
| name | yes | string | Non-empty |
| role | yes | enum | `PROGRAM_HEAD`, `ASSOCIATE_DIRECTOR`, `ADMIN`, `OPERATIONS` |
| designation | yes | string | Non-empty |
| isActive | no | boolean | Default `true` |
| approverUserId | no | string \| null | Must reference an existing User.id |
| joinDate | no | ISO 8601 date string | e.g. `"2024-01-15"` |
| exitDate | no | ISO 8601 date string | |

**Example request**
```json
{
  "email": "alice@example.org",
  "name": "Alice Kumar",
  "role": "PROGRAM_HEAD",
  "designation": "Senior Program Officer",
  "isActive": true,
  "approverUserId": null,
  "joinDate": "2024-03-01"
}
```

**Success response** — `201 Created`
```json
{
  "ok": true,
  "data": {
    "id": "clxyz123",
    "email": "alice@example.org",
    "name": "Alice Kumar",
    "role": "PROGRAM_HEAD",
    "designation": "Senior Program Officer",
    "isActive": true,
    "approverUserId": null,
    "joinDate": "2024-03-01T00:00:00.000Z",
    "exitDate": null,
    "createdAt": "2026-07-01T10:00:00.000Z",
    "updatedAt": "2026-07-01T10:00:00.000Z"
  }
}
```

**Error — duplicate email** — `409 Conflict`
```json
{ "ok": false, "error": { "code": "DUPLICATE", "message": "email already in use.", "details": null } }
```

**Error — invalid role** — `400 Bad Request`
```json
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "role must be one of: PROGRAM_HEAD, ASSOCIATE_DIRECTOR, ADMIN, OPERATIONS.", "details": null } }
```

---

### GET /api/v1/users — List users

**Query parameters** (all optional)

| Param | Type | Default | Notes |
|---|---|---|---|
| role | enum | — | Filter by `PROGRAM_HEAD`, `ASSOCIATE_DIRECTOR`, `ADMIN`, `OPERATIONS` |
| isActive | `true` \| `false` | — | Filter by active status |
| search | string | — | Case-insensitive contains on `name` or `email` |
| page | integer | 1 | Page number |
| pageSize | integer | 25 | Max 100 |

**Example request**
```
GET /api/v1/users?isActive=true&search=alice&page=1&pageSize=10
```

**Success response** — `200 OK`
```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "clxyz123",
        "email": "alice@example.org",
        "name": "Alice Kumar",
        "role": "PROGRAM_HEAD",
        "designation": "Senior Program Officer",
        "isActive": true,
        "approverUserId": null,
        "joinDate": "2024-03-01T00:00:00.000Z",
        "exitDate": null,
        "createdAt": "2026-07-01T10:00:00.000Z",
        "updatedAt": "2026-07-01T10:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 10
  }
}
```

---

### GET /api/v1/users/:id — Get user

**Success response** — `200 OK`
```json
{
  "ok": true,
  "data": {
    "id": "clxyz123",
    "email": "alice@example.org",
    "name": "Alice Kumar",
    "role": "PROGRAM_HEAD",
    "designation": "Senior Program Officer",
    "isActive": true,
    "approverUserId": null,
    "joinDate": "2024-03-01T00:00:00.000Z",
    "exitDate": null,
    "createdAt": "2026-07-01T10:00:00.000Z",
    "updatedAt": "2026-07-01T10:00:00.000Z"
  }
}
```

**Error — not found** — `404 Not Found`
```json
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "User not found.", "details": null } }
```

---

### PATCH /api/v1/users/:id — Update user

All fields optional. Only fields present in the body are updated.

**Forbidden fields** (will return 400 if included): `passwordHash`, `passwordSetAt`, `passwordResetRequired`, `emailVerifiedAt`, `azureAdId`, `azureGroups`, `lastLoginAt`.

**Example request**
```json
{
  "name": "Alice Kumar Sharma",
  "designation": "Lead Program Officer",
  "isActive": true
}
```

**Success response** — `200 OK`
```json
{
  "ok": true,
  "data": {
    "id": "clxyz123",
    "email": "alice@example.org",
    "name": "Alice Kumar Sharma",
    "role": "PROGRAM_HEAD",
    "designation": "Lead Program Officer",
    "isActive": true,
    "approverUserId": null,
    "joinDate": "2024-03-01T00:00:00.000Z",
    "exitDate": null,
    "createdAt": "2026-07-01T10:00:00.000Z",
    "updatedAt": "2026-07-01T11:30:00.000Z"
  }
}
```

**Error — forbidden field** — `400 Bad Request`
```json
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "Field \"passwordHash\" cannot be set via this API.", "details": null } }
```

---

### DELETE /api/v1/users/:id — Soft delete user

Sets `isActive = false`. Idempotent — succeeds even if already inactive. No hard delete.

**Success response** — `200 OK`
```json
{
  "ok": true,
  "data": {
    "id": "clxyz123",
    "email": "alice@example.org",
    "name": "Alice Kumar Sharma",
    "role": "PROGRAM_HEAD",
    "designation": "Lead Program Officer",
    "isActive": false,
    "approverUserId": null,
    "joinDate": "2024-03-01T00:00:00.000Z",
    "exitDate": null,
    "createdAt": "2026-07-01T10:00:00.000Z",
    "updatedAt": "2026-07-01T12:00:00.000Z"
  }
}
```

---

## Projects

### POST /api/v1/projects — Create project

**Request body**

| Field | Required | Type | Notes |
|---|---|---|---|
| code | yes | string | Non-empty, unique |
| name | yes | string | Non-empty |
| description | no | string \| null | |
| isActive | no | boolean | Default `true` |

**Example request**
```json
{
  "code": "PROJ-WATER-2024",
  "name": "Urban Water Access 2024",
  "description": "WASH programme for urban slums",
  "isActive": true
}
```

**Success response** — `201 Created`
```json
{
  "ok": true,
  "data": {
    "id": "clpqr456",
    "code": "PROJ-WATER-2024",
    "name": "Urban Water Access 2024",
    "description": "WASH programme for urban slums",
    "isActive": true,
    "createdAt": "2026-07-01T10:00:00.000Z",
    "updatedAt": "2026-07-01T10:00:00.000Z"
  }
}
```

**Error — duplicate code** — `409 Conflict`
```json
{ "ok": false, "error": { "code": "DUPLICATE", "message": "code already in use.", "details": null } }
```

---

### GET /api/v1/projects — List projects

**Query parameters** (all optional)

| Param | Type | Default | Notes |
|---|---|---|---|
| isActive | `true` \| `false` | — | Filter by active status |
| search | string | — | Case-insensitive contains on `name` or `code` |
| page | integer | 1 | |
| pageSize | integer | 25 | Max 100 |

**Success response** — `200 OK`
```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "clpqr456",
        "code": "PROJ-WATER-2024",
        "name": "Urban Water Access 2024",
        "description": "WASH programme for urban slums",
        "isActive": true,
        "createdAt": "2026-07-01T10:00:00.000Z",
        "updatedAt": "2026-07-01T10:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 25
  }
}
```

---

### GET /api/v1/projects/:id — Get project

**Success response** — `200 OK`
```json
{
  "ok": true,
  "data": {
    "id": "clpqr456",
    "code": "PROJ-WATER-2024",
    "name": "Urban Water Access 2024",
    "description": "WASH programme for urban slums",
    "isActive": true,
    "createdAt": "2026-07-01T10:00:00.000Z",
    "updatedAt": "2026-07-01T10:00:00.000Z"
  }
}
```

**Error — not found** — `404 Not Found`
```json
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "Project not found.", "details": null } }
```

---

### PATCH /api/v1/projects/:id — Update project

All fields optional.

**Example request**
```json
{
  "name": "Urban Water Access Programme 2024",
  "isActive": false
}
```

**Success response** — `200 OK`
```json
{
  "ok": true,
  "data": {
    "id": "clpqr456",
    "code": "PROJ-WATER-2024",
    "name": "Urban Water Access Programme 2024",
    "description": "WASH programme for urban slums",
    "isActive": false,
    "createdAt": "2026-07-01T10:00:00.000Z",
    "updatedAt": "2026-07-01T11:00:00.000Z"
  }
}
```

---

### DELETE /api/v1/projects/:id — Soft delete project

Sets `isActive = false`. Idempotent.

**Success response** — `200 OK`
```json
{
  "ok": true,
  "data": {
    "id": "clpqr456",
    "code": "PROJ-WATER-2024",
    "name": "Urban Water Access Programme 2024",
    "description": "WASH programme for urban slums",
    "isActive": false,
    "createdAt": "2026-07-01T10:00:00.000Z",
    "updatedAt": "2026-07-01T12:00:00.000Z"
  }
}
```

---

## Common error codes

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid `Authorization: Bearer` header |
| `VALIDATION_ERROR` | 400 | Missing required field, invalid enum/email, or forbidden field |
| `INVALID_JSON` | 400 | Request body is not valid JSON |
| `NOT_FOUND` | 404 | Resource with given id does not exist |
| `DUPLICATE` | 409 | `email` (users) or `code` (projects) already in use |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error |
