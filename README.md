# Galactic Fleet Command

A backend service for managing fleets in a fictional galactic command system. Fleets move through a lifecycle driven by asynchronous commands, and shared fuel resources are allocated safely under concurrent access.

---

## Running the service

**Prerequisites:** Node.js ≥ 20

```bash
npm install
npm run dev        # development — ts-node-dev, auto-restarts on save
```

```bash
npm run build      # compile TypeScript → dist/
npm start          # run compiled output
```

The API listens on port **3000** by default. Set the `PORT` environment variable to override.

```bash
PORT=8080 npm run dev
```

### API Explorer

Opening `http://localhost:3000` in a browser loads the interactive API Explorer — a Vue.js UI that wraps every endpoint with forms, sample data, and live request execution.

### Running tests

```bash
npm test
```

65 tests across unit, integration, and end-to-end suites.

---

## API Reference

Base URL: `http://localhost:3000`

All request and response bodies are JSON. Error responses have the shape `{ "error": "..." }`.

---

### System

#### `GET /health`

Returns the service status.

**Response `200`**
```json
{ "status": "ok" }
```

---

### Fleets

#### `POST /fleets`

Creates a new fleet in `Docked` state.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | ✓ | Fleet name |
| `shipCount` | number | ✓ | Number of ships (≥ 1) |
| `fuelRequired` | number | ✓ | Fuel units needed for preparation (≥ 0) |

**Response `201`**
```json
{
  "id": "a1b2c3d4-...",
  "version": 0,
  "name": "Iron Nebula",
  "shipCount": 12,
  "fuelRequired": 500,
  "state": "Docked"
}
```

**Errors:** `400` — missing or invalid fields.

---

#### `GET /fleets/:id`

Retrieves a fleet by ID.

**Response `200`** — fleet object (same shape as above).

**Errors:** `404` — fleet not found.

---

#### `PATCH /fleets/:id`

Updates mutable fleet properties. All fields are optional; omitted fields are unchanged. State is managed exclusively by commands and cannot be set here.

**Request body**

| Field | Type | Description |
|---|---|---|
| `name` | string | New fleet name |
| `shipCount` | number | Updated ship count (≥ 1) |
| `fuelRequired` | number | Updated fuel requirement (≥ 0) |

**Response `200`** — updated fleet object.

**Errors:** `400` invalid field value, `404` fleet not found.

---

### Commands

Commands are processed asynchronously by a background worker. Submit a command and then poll `GET /commands/:id` until the status reaches `Succeeded` or `Failed`.

**Command statuses:** `Queued` → `Processing` → `Succeeded` | `Failed`

#### `POST /commands`

Submits a command for processing.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string | ✓ | `PrepareFleet` or `DeployFleet` |
| `payload` | object | ✓ | Command-specific parameters (see below) |

**`PrepareFleet` payload**

```json
{ "fleetId": "<fleet-id>" }
```

Transitions the fleet `Docked → Preparing`, attempts to reserve fuel from the shared pool, then moves to `Ready` on success or `FailedPreparation` if fuel is insufficient.

**`DeployFleet` payload**

```json
{ "fleetId": "<fleet-id>" }
```

Transitions the fleet `Ready → Deployed`.

**Response `201`**
```json
{
  "id": "e5f6a7b8-...",
  "version": 0,
  "type": "PrepareFleet",
  "status": "Queued",
  "payload": { "fleetId": "a1b2c3d4-..." }
}
```

**Errors:** `400` — unknown command type or invalid payload.

---

#### `GET /commands/:id`

Retrieves a command and its current status.

**Response `200`** — command object (same shape as above, with updated `status`).

**Errors:** `404` — command not found.

---

### History

#### `GET /history`

Returns the complete fleet state transition log across all fleets, in insertion order. Each record is written immediately after a transition occurs and includes a point-in-time snapshot of all resource pools.

**Query parameters** (both optional)

| Parameter | Type | Description |
|---|---|---|
| `from` | ISO-8601 string | Include records with `timestamp >= from` |
| `to` | ISO-8601 string | Include records with `timestamp <= to` |

**Example**
```
GET /history?from=2025-01-01T00:00:00.000Z&to=2025-12-31T23:59:59.999Z
```

**Response `200`**
```json
[
  {
    "id": "c9d0e1f2-...",
    "timestamp": "2025-06-15T10:23:45.123Z",
    "fleetId": "a1b2c3d4-...",
    "fleetName": "Iron Nebula",
    "shipCount": 12,
    "fuelRequired": 500,
    "fromState": "Docked",
    "toState": "Preparing",
    "resources": [
      {
        "resourceType": "FUEL",
        "total": 10000,
        "reserved": 0,
        "available": 10000
      }
    ]
  },
  {
    "id": "d1e2f3a4-...",
    "timestamp": "2025-06-15T10:23:45.130Z",
    "fleetId": "a1b2c3d4-...",
    "fleetName": "Iron Nebula",
    "shipCount": 12,
    "fuelRequired": 500,
    "fromState": "Preparing",
    "toState": "Ready",
    "resources": [
      {
        "resourceType": "FUEL",
        "total": 10000,
        "reserved": 500,
        "available": 9500
      }
    ]
  }
]
```

**Errors:** `400` — invalid `from`/`to` date string, or `from` is after `to`.

---

## Fleet lifecycle

```
Docked
  └─► Preparing
        ├─► Ready
        │     └─► Deployed
        └─► FailedPreparation
```

| Transition | Trigger | Condition |
|---|---|---|
| Docked → Preparing | `PrepareFleet` command | Fleet must be `Docked` |
| Preparing → Ready | `PrepareFleet` (success) | Fuel pool has sufficient available units |
| Preparing → FailedPreparation | `PrepareFleet` (failure) | Insufficient fuel or no pool seeded |
| Ready → Deployed | `DeployFleet` command | Fleet must be `Ready` |

---

## Design decisions

**Optimistic locking for concurrency.** Every entity carries a `version` field. Repository `update()` checks the version before writing and throws `ConcurrencyError` on mismatch. The fuel reservation loop retries on `ConcurrencyError`, making it safe to add multiple workers without changing the core logic.

**Separate history repository.** The `Fleet` entity is unchanged by the history feature. A dedicated `FleetHistoryRepository` (append-only, time-range queryable) is written to after every transition via a single `recordTransition()` helper, ensuring no call site can accidentally skip recording.

**Single background worker.** Commands are processed one at a time by a `setImmediate`-driven drain loop. The queue is FIFO; no scheduling, retry backoff, or dead-letter handling was implemented (out of scope per spec).

**Resource seeding at startup.** `src/index.ts` seeds a 10 000-unit FUEL pool on boot. Additional resource types (`HYPERDRIVE_CORE`, `BATTLE_DROIDS`) are defined in the domain but not seeded — they are available to extend without code changes.

## Tradeoffs

- **In-memory only.** All state is lost on restart. Acceptable for this scope; a real system would back repositories with a database.
- **Single worker = sequential processing.** Eliminates most concurrency risk at the cost of throughput. The optimistic locking layer means scaling to multiple workers requires only removing the single-worker constraint, not rearchitecting the storage layer.
- **No authentication.** All endpoints are unauthenticated. A real deployment would add API keys or JWT middleware.

## What I would improve with more time

- Persist state to a real database (PostgreSQL with transactions would replace optimistic locking naturally)
- Add retry backoff and a dead-letter queue for failed commands
- Expose resource pool seeding via API rather than hardcoding at startup
- Add structured logging (correlation IDs, command lifecycle events)
- Add pagination to `GET /history`
- OpenAPI / JSON Schema spec generated from the TypeScript types
