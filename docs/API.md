# Yappy API Reference

> REST API for managing **Contacts** and **Groups** (and the membership between them).
>
> This document is the contract between the backend and any frontend client (human or AI agent).
> It is intentionally **modular**: shared rules live in [Conventions](#2-conventions), and every
> endpoint is documented with an identical, self-contained template so new resources or endpoints
> can be added without restructuring the document.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Conventions](#2-conventions)
   - [Base URL & Routing](#21-base-url--routing)
   - [Request Format](#22-request-format)
   - [Response Format & Status Codes](#23-response-format--status-codes)
   - [Authentication](#24-authentication)
   - [CORS](#25-cors)
   - [Pagination](#26-pagination)
3. [Data Models](#3-data-models)
   - [Contact](#31-contact)
   - [Group](#32-group)
4. [Contacts API](#4-contacts-api)
5. [Groups API](#5-groups-api)
6. [Error Handling](#6-error-handling)
7. [Implementation Notes & Known Quirks](#7-implementation-notes--known-quirks)
8. [Changelog](#8-changelog)
9. [Appendix: How to extend this document](#9-appendix-how-to-extend-this-document)

---

## 1. Overview

| Property            | Value                                                         |
| ------------------- | ------------------------------------------------------------- |
| Protocol            | HTTP/1.1, JSON over REST                                      |
| Default host        | `http://localhost:3000`                                       |
| Port                | `process.env.PORT` (default `3000`)                           |
| Content type        | `application/json`                                            |
| Auth                | None (open API — see [§2.4](#24-authentication))              |
| Persistence         | JSONL flat-file store (one JSON object per line)              |
| Stack               | Node.js + Express 5                                           |

There are two resources:

- **Contact** — an individual entity (e.g. a person/recipient).
- **Group** — a named collection that can contain Contact references and has an on/off `status`.

Both resources share the same CRUD surface. Groups add two extra operations:
membership management and a status toggle.

---

## 2. Conventions

These rules apply to **every** endpoint unless an endpoint explicitly overrides them.

### 2.1 Base URL & Routing

All routes are prefixed with `/api/<resource>`:

| Resource | Prefix          |
| -------- | --------------- |
| Contact  | `/api/contact`  |
| Group    | `/api/group`    |

Full URL pattern:

```
http://localhost:3000/api/<resource>/<...path>
```

> ⚠️ **Trailing slash matters for collection routes.** The create and list endpoints are
> registered at the path **with a trailing slash** (`/api/contact/`). Always include it for
> those two operations.

### 2.2 Request Format

- Request bodies must be **JSON** with header `Content-Type: application/json`.
  (URL-encoded bodies are also parsed, but JSON is the supported contract.)
- Path parameters are always **UUID v4** strings (record IDs).
- The server **auto-generates** the `id` field. You must **never** send an `id` in a
  create or update body — doing so causes the operation to fail (see [§6](#6-error-handling)).

### 2.3 Response Format & Status Codes

> ⚠️ **All successful responses currently return HTTP `201 Created`** — including `GET`,
> `DELETE`, and update operations. This is a backend-wide convention in the current
> implementation. **Do not branch frontend logic on the status code; branch on the response
> body shape instead.** (Tracked in [§7](#7-implementation-notes--known-quirks).)

| Situation                       | Status | Body                                  |
| ------------------------------- | ------ | ------------------------------------- |
| Any successful request          | `201`  | Varies per endpoint (documented below)|
| Unhandled server error          | `500`  | Express default error HTML/text       |

Response bodies are JSON. Note that some write operations return an **empty body** on success
(see each endpoint).

### 2.4 Authentication

**None.** There is no API key, token, or session. Every endpoint is publicly callable.
Do not send `Authorization` headers; they are ignored.

### 2.5 CORS

CORS is **fully open** (`Access-Control-Allow-Origin: *`) via the `cors` middleware with default
settings. Browser clients from any origin may call the API.

### 2.6 Pagination

The **list** endpoints support page-based pagination via query parameters:

| Param  | Type    | Default | Description                          |
| ------ | ------- | ------- | ------------------------------------ |
| `page` | integer | `1`     | 1-based page number                  |
| `size` | integer | `10`    | Number of records per page           |

The window returned is the slice `[(page-1)*size, page*size - 1]` (inclusive) over the
insertion-ordered record list.

> ⚠️ `page` and `size` are read from the query string as **strings** and used in arithmetic.
> Always pass clean integer values (e.g. `?page=2&size=20`). The response is a bare JSON
> **array** — there is no envelope, `total`, or `hasMore` field today.

---

## 3. Data Models

### 3.1 Contact

| Field      | Type       | Notes                                              |
| ---------- | ---------- | -------------------------------------------------- |
| `id`       | string     | UUID v4. Server-generated. Read-only.              |
| `name`     | string     | Display name. (No schema enforcement — see note.)  |
| `contacts` | string[]   | Present in seed data; typically an empty array.    |

> The backend performs **no schema validation**. Any JSON shape you send (minus `id`) is
> persisted verbatim. The fields above reflect the seed data and intended usage.

**Example record:**

```json
{
  "id": "a1dbce1f-3f56-4354-8545-803cd3ee4807",
  "name": "XM5AW2",
  "contacts": []
}
```

### 3.2 Group

| Field      | Type       | Notes                                                          |
| ---------- | ---------- | -------------------------------------------------------------- |
| `id`       | string     | UUID v4. Server-generated. Read-only.                          |
| `name`     | string     | Group display name.                                            |
| `contacts` | string[]   | Array of **Contact `id`s** that belong to the group. Optional. |
| `status`   | boolean    | Active/inactive flag. Created/managed via the toggle endpoint. |

**Example record:**

```json
{
  "id": "7bd5d607-7bc8-4f12-84d7-b0d24e2b79ee",
  "name": "Bangalore Techies",
  "contacts": [
    "a1dbce1f-3f56-4354-8545-803cd3ee4807",
    "bf9878fb-d3a2-4b02-a07d-1ada88472020"
  ],
  "status": true
}
```

> `contacts` and `status` may be **absent** on older records (the store does not backfill
> defaults). Treat missing `contacts` as `[]` and missing `status` as `false` on the client.

---

## 4. Contacts API

Base path: `/api/contact`

| #   | Method   | Path                       | Description          |
| --- | -------- | -------------------------- | -------------------- |
| 4.1 | `POST`   | `/api/contact/`            | Create a contact     |
| 4.2 | `GET`    | `/api/contact/`            | List contacts (paged)|
| 4.3 | `GET`    | `/api/contact/:id`         | Get a contact by id  |
| 4.4 | `POST`   | `/api/contact/:id`         | Update a contact     |
| 4.5 | `DELETE` | `/api/contact/:id`         | Delete a contact     |

---

### 4.1 Create Contact

Create a new contact. The server generates and returns the `id`.

| Property      | Value                              |
| ------------- | ---------------------------------- |
| Method        | `POST`                             |
| Path          | `/api/contact/`                    |
| Auth          | None                               |
| Success status| `201`                              |

**Body parameters**

| Field  | Type   | Required | Description                          |
| ------ | ------ | -------- | ------------------------------------ |
| `name` | string | No*      | Contact display name.                |
| *any*  | any    | No       | Any extra fields are stored as-is.   |

> \* No field is enforced by the backend, but `name` is the expected primary field.
> The body **must not** contain an `id`.

**Example request**

```bash
curl -X POST http://localhost:3000/api/contact/ \
  -H "Content-Type: application/json" \
  -d '{ "name": "Alice" }'
```

**Example success response** — `201`

```json
{ "id": "67515375-267f-477b-a570-395b715bf065" }
```

**Failure (e.g. `id` present in body)** — `201`

```json
{ "id": false }
```

> If creation fails internally (for example you sent an `id`), the handler still responds
> `201` but with `{ "id": false }`. **Check that `id` is a truthy string** before treating
> the create as successful.

---

### 4.2 List Contacts

Return a paginated array of contacts.

| Property      | Value             |
| ------------- | ----------------- |
| Method        | `GET`             |
| Path          | `/api/contact/`   |
| Auth          | None              |
| Success status| `201`             |

**Query parameters** — see [Pagination](#26-pagination) (`page`, `size`).

**Example request**

```bash
curl "http://localhost:3000/api/contact/?page=1&size=2"
```

**Example success response** — `201`

```json
[
  { "id": "67515375-267f-477b-a570-395b715bf065", "name": "xA1Dae", "contacts": [] },
  { "id": "a1dbce1f-3f56-4354-8545-803cd3ee4807", "name": "XM5AW2", "contacts": [] }
]
```

> Returns a bare array. An out-of-range page returns `[]`.

---

### 4.3 Get Contact by ID

Fetch a single contact by its UUID.

| Property      | Value                |
| ------------- | -------------------- |
| Method        | `GET`                |
| Path          | `/api/contact/:id`   |
| Auth          | None                 |
| Success status| `201`                |

**Path parameters**

| Param | Type   | Description           |
| ----- | ------ | --------------------- |
| `id`  | string | Contact UUID v4.      |

**Example request**

```bash
curl http://localhost:3000/api/contact/a1dbce1f-3f56-4354-8545-803cd3ee4807
```

**Example success response** — `201`

```json
{
  "id": "a1dbce1f-3f56-4354-8545-803cd3ee4807",
  "name": "XM5AW2",
  "contacts": []
}
```

> ⚠️ **Known issue:** this endpoint currently fails at runtime because the route calls a
> method (`findById`) that is not exposed on the resource module. See
> [§7](#7-implementation-notes--known-quirks). The shape above is the **intended** response.

---

### 4.4 Update Contact

Patch an existing contact. Provided fields are **merged** into the stored record
(shallow merge); omitted fields are left unchanged.

| Property      | Value                |
| ------------- | -------------------- |
| Method        | `POST`               |
| Path          | `/api/contact/:id`   |
| Auth          | None                 |
| Success status| `201`                |

**Path parameters**

| Param | Type   | Description       |
| ----- | ------ | ----------------- |
| `id`  | string | Contact UUID v4.  |

**Body parameters** — any fields to merge. **Must not** contain `id`.

**Example request**

```bash
curl -X POST http://localhost:3000/api/contact/a1dbce1f-3f56-4354-8545-803cd3ee4807 \
  -H "Content-Type: application/json" \
  -d '{ "name": "Alice Smith" }'
```

**Example success response** — `201`

```
(empty body)
```

> On success the update endpoint returns **`201` with no body**. On failure (record not
> found, or `id` present in body) it returns `201` with body `false`. Re-fetch the record
> if you need the updated state.

---

### 4.5 Delete Contact

Delete a contact by id.

| Property      | Value                |
| ------------- | -------------------- |
| Method        | `DELETE`             |
| Path          | `/api/contact/:id`   |
| Auth          | None                 |
| Success status| `201`                |

**Path parameters**

| Param | Type   | Description       |
| ----- | ------ | ----------------- |
| `id`  | string | Contact UUID v4.  |

**Example request**

```bash
curl -X DELETE http://localhost:3000/api/contact/a1dbce1f-3f56-4354-8545-803cd3ee4807
```

**Example success response** — `201`

```json
true
```

> Body is the boolean `true` when a record was deleted, `false` when no record matched
> the id. (No 404 is returned — branch on the boolean.)

---

## 5. Groups API

Base path: `/api/group`

Groups support the same CRUD surface as Contacts (5.1–5.5) plus two group-specific
operations (5.6–5.7).

| #   | Method   | Path                                                      | Description                |
| --- | -------- | --------------------------------------------------------- | -------------------------- |
| 5.1 | `POST`   | `/api/group/`                                             | Create a group             |
| 5.2 | `GET`    | `/api/group/`                                             | List groups (paged)        |
| 5.3 | `GET`    | `/api/group/:id`                                          | Get a group by id          |
| 5.4 | `POST`   | `/api/group/:id`                                          | Update a group             |
| 5.5 | `DELETE` | `/api/group/:id`                                          | Delete a group             |
| 5.6 | `POST`   | `/api/group/group/:groupId/contact/:contactId`           | Add a contact to a group   |
| 5.7 | `POST`   | `/api/group/toggle/:groupId`                              | Toggle group active status |

> The 5.1–5.5 endpoints behave **identically** to their Contact counterparts
> ([§4.1–§4.5](#4-contacts-api)), including the same status codes and response-body quirks.
> Only resource-specific examples are shown below; refer to §4 for full field-level detail.

---

### 5.1 Create Group

| Property       | Value             |
| -------------- | ----------------- |
| Method         | `POST`            |
| Path           | `/api/group/`     |
| Success status | `201`             |

**Body parameters**

| Field      | Type     | Required | Description                                  |
| ---------- | -------- | -------- | -------------------------------------------- |
| `name`     | string   | No*      | Group name.                                  |
| `contacts` | string[] | No       | Initial array of Contact ids.                |

\* Not enforced, but expected. Body **must not** contain `id`.

**Example request**

```bash
curl -X POST http://localhost:3000/api/group/ \
  -H "Content-Type: application/json" \
  -d '{ "name": "Engineering", "contacts": [] }'
```

**Example success response** — `201`

```json
{ "id": "f6ca9cb5-71b9-4405-9887-2e4d97ebcace" }
```

> Same `{ "id": false }` failure shape as [§4.1](#41-create-contact).

---

### 5.2 List Groups

| Property       | Value           |
| -------------- | --------------- |
| Method         | `GET`           |
| Path           | `/api/group/`   |
| Success status | `201`           |

Query params: `page`, `size` (see [Pagination](#26-pagination)).

**Example request**

```bash
curl "http://localhost:3000/api/group/?page=1&size=3"
```

**Example success response** — `201`

```json
[
  { "id": "7bd5d607-7bc8-4f12-84d7-b0d24e2b79ee", "name": "Bangalore Techies", "contacts": ["a1dbce1f-3f56-4354-8545-803cd3ee4807", "bf9878fb-d3a2-4b02-a07d-1ada88472020"] },
  { "id": "f6ca9cb5-71b9-4405-9887-2e4d97ebcace", "name": "Engineering", "contacts": [] },
  { "id": "3305bb20-7263-44f1-8487-be4537f1cc38", "name": "Sales", "contacts": ["bf9878fb-d3a2-4b02-a07d-1ada88472020", "e97ca3b2-27ac-4277-81c5-3695f2467979"] }
]
```

---

### 5.3 Get Group by ID

| Property       | Value              |
| -------------- | ------------------ |
| Method         | `GET`              |
| Path           | `/api/group/:id`   |
| Success status | `201`              |

**Example request**

```bash
curl http://localhost:3000/api/group/7bd5d607-7bc8-4f12-84d7-b0d24e2b79ee
```

**Example success response** — `201`

```json
{
  "id": "7bd5d607-7bc8-4f12-84d7-b0d24e2b79ee",
  "name": "Bangalore Techies",
  "contacts": [
    "a1dbce1f-3f56-4354-8545-803cd3ee4807",
    "bf9878fb-d3a2-4b02-a07d-1ada88472020"
  ]
}
```

> ⚠️ Same `findById` runtime issue as [§4.3](#43-get-contact-by-id). Shape shown is intended.

---

### 5.4 Update Group

| Property       | Value              |
| -------------- | ------------------ |
| Method         | `POST`             |
| Path           | `/api/group/:id`   |
| Success status | `201`              |

Shallow-merge semantics; body must not contain `id`. Returns empty body on success,
`false` on failure — see [§4.4](#44-update-contact).

**Example request**

```bash
curl -X POST http://localhost:3000/api/group/f6ca9cb5-71b9-4405-9887-2e4d97ebcace \
  -H "Content-Type: application/json" \
  -d '{ "name": "Platform Engineering" }'
```

> To replace the membership list wholesale, send `{ "contacts": [...] }` here. To append a
> single contact, prefer [§5.6](#56-add-contact-to-group).

---

### 5.5 Delete Group

| Property       | Value              |
| -------------- | ------------------ |
| Method         | `DELETE`           |
| Path           | `/api/group/:id`   |
| Success status | `201`              |

**Example request**

```bash
curl -X DELETE http://localhost:3000/api/group/f6ca9cb5-71b9-4405-9887-2e4d97ebcace
```

Returns boolean `true`/`false` — see [§4.5](#45-delete-contact).

---

### 5.6 Add Contact to Group

Append a Contact id to a group's `contacts` array.

| Property       | Value                                            |
| -------------- | ------------------------------------------------ |
| Method         | `POST`                                           |
| Path           | `/api/group/group/:groupId/contact/:contactId`   |
| Auth           | None                                             |
| Success status | `201`                                            |

> ℹ️ The path segment `group` appears twice (`/api/group/group/...`) — this is the literal,
> correct route. The first `group` is the resource prefix; the second is part of the
> sub-route path.

**Path parameters**

| Param        | Type   | Description                          |
| ------------ | ------ | ------------------------------------ |
| `groupId`    | string | UUID of the group to modify.         |
| `contactId`  | string | UUID of the contact to add.          |

**Behavior**

- If the group exists, `contactId` is **appended** to `group.contacts`
  (the array is created if it was absent).
- The `contactId` is **not validated** against the Contacts store — any string is appended.
- **No de-duplication** is performed; adding the same contact twice stores it twice.

**Example request**

```bash
curl -X POST \
  http://localhost:3000/api/group/group/7bd5d607-7bc8-4f12-84d7-b0d24e2b79ee/contact/e97ca3b2-27ac-4277-81c5-3695f2467979
```

**Example success response** — `201`

```
(empty body)
```

**Group not found** — `201`

```json
false
```

> Returns empty body on success, `false` if the group id does not exist. Re-fetch the group
> to confirm membership.

---

### 5.7 Toggle Group Status

Flip the group's boolean `status` field (active ⇄ inactive).

| Property       | Value                          |
| -------------- | ------------------------------ |
| Method         | `POST`                         |
| Path           | `/api/group/toggle/:groupId`   |
| Auth           | None                           |
| Success status | `201`                          |

**Path parameters**

| Param     | Type   | Description                  |
| --------- | ------ | ---------------------------- |
| `groupId` | string | UUID of the group to toggle. |

**Behavior**

- Reads the current `status` (treated as `false` if absent) and writes its negation.
- First call on a group with no `status` sets it to `true`.

**Example request**

```bash
curl -X POST http://localhost:3000/api/group/toggle/7bd5d607-7bc8-4f12-84d7-b0d24e2b79ee
```

**Example success response** — `201`

```
(empty body)
```

**Group not found** — `201`

```json
false
```

> No request body is needed. Returns empty body on success, `false` if the group does not
> exist. Re-fetch the group to read the new `status`.

---

## 6. Error Handling

The current implementation does **not** use HTTP error status codes for business failures.
Instead, failures are signaled in the response body. Clients should defend accordingly.

| Failure mode                                   | HTTP status | Body            | How to detect on client                          |
| ---------------------------------------------- | ----------- | --------------- | ------------------------------------------------ |
| Create failed (e.g. body contained `id`)       | `201`       | `{ "id": false }` | `typeof res.id !== "string"`                     |
| Update failed (not found / `id` in body)       | `201`       | `false`         | `res === false`                                  |
| Delete: nothing matched the id                 | `201`       | `false`         | `res === false`                                  |
| Add-contact / toggle: group not found          | `201`       | `false`         | `res === false`                                  |
| Get-by-id (current runtime bug)                | `500`       | Express error   | Network/5xx handling                             |
| Unhandled exception                            | `500`       | Express error   | Network/5xx handling                             |

**Recommended client pattern**

```js
async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status >= 500) throw new Error(`Server error ${res.status}`);

  const text = await res.text();
  const data = text ? JSON.parse(text) : null; // some writes return empty body

  // Business-failure sentinels:
  if (data === false) throw new Error("Operation failed (not found / invalid)");
  if (data && data.id === false) throw new Error("Create failed");

  return data; // object | array | null (empty-body success)
}
```

---

## 7. Implementation Notes & Known Quirks

These are accurate descriptions of the **current** backend behavior. They are documented so
frontend code can be written defensively; some are likely to be fixed later (see Changelog).

1. **All successes return `201`.** Reads, deletes, and updates all respond `201`, not
   `200`/`204`. Do not branch on status code for success/failure — branch on body shape.

2. **`GET /:id` is currently broken.** The route handler calls `module.findById(...)`, but the
   resource modules expose `getById` (not `findById`). At runtime this throws and yields a
   `500`. The documented response shape ([§4.3](#43-get-contact-by-id),
   [§5.3](#53-get-group-by-id)) reflects the **intended** contract once fixed. As a workaround,
   use the list endpoint and filter client-side.

3. **Empty-body successes.** Update ([§4.4](#44-update-contact)/[§5.4](#54-update-group)),
   add-contact ([§5.6](#56-add-contact-to-group)), and toggle ([§5.7](#57-toggle-group-status))
   return **no body** on success. Always handle an empty response (parse only if non-empty).

4. **Sentinel-value failures.** Business failures return `false` (or `{ id: false }`) with a
   `201`, not a 4xx. See [§6](#6-error-handling).

5. **No validation.** The backend persists whatever JSON you send (minus `id`). There is no
   schema, type, or required-field enforcement. Validate on the client.

6. **No referential integrity.** `Group.contacts` ids are not checked against the Contacts
   store, and there is no de-duplication when adding a contact ([§5.6](#56-add-contact-to-group)).

7. **No `id` in request bodies.** Sending `id` in a create/update body causes that operation
   to fail (returns the sentinel above). Ids are server-generated UUID v4 only.

8. **Pagination is unenveloped.** List responses are bare arrays with no total/has-more
   metadata; `page`/`size` are consumed as strings. Pass clean integers.

9. **Persistence is a flat JSONL file.** Each resource has one append-only `.jsonl` file;
   updates trigger a full file rewrite. Not suitable for concurrent high-write workloads.

---

## 8. Changelog

| Date       | Change                                            |
| ---------- | ------------------------------------------------- |
| 2026-06-18 | Initial version. Documents Contacts & Groups CRUD, group membership, and status toggle. |

---

## 9. Appendix: How to extend this document

This document is structured so that change is cheap:

- **New endpoint on an existing resource** → add a numbered subsection under that resource's
  section (§4 or §5) using the standard template: a property table (Method/Path/Auth/Success
  status), path/body/query parameter tables, an `Example request` (curl), and an
  `Example success response`. Add a row to the resource's route-summary table.

- **New resource** → copy the [Contacts API](#4-contacts-api) section as a template, add a
  prefix row to [§2.1](#21-base-url--routing), a model to [§3](#3-data-models), and a
  Table-of-Contents entry. Because the CRUD behavior is shared via the route binder,
  reference §4 for shared semantics instead of duplicating them.

- **Behavior change affecting all endpoints** → update [§2 Conventions](#2-conventions) and/or
  [§7 Quirks](#7-implementation-notes--known-quirks) only; per-endpoint sections inherit it.

- **Always** add a row to the [Changelog](#8-changelog).
