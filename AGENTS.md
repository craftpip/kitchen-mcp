# Project AGENTS.md

## Project Overview

Kitchen MCP — a local-first Model Context Protocol server that gives an external LLM structured kitchen knowledge and controlled kitchen operations. Inventory, recipes, equipment, cooking sessions, timers, restrictions, preferences, and recipe matching. The server is the source of truth for all kitchen state — the LLM never is.

## Commands

- Typecheck: `npx tsc --noEmit`
- Build: `npm run build`
- Dev: `npm run dev`
- Test: `npm test`
- Run (stdio): `npm start`
- Run (HTTP): `npm run dev -- --http` or `node dist/index.js --http`
- Docker restart: `docker restart kitchen-mcp`
- Docker logs: `docker logs kitchen-mcp --tail 20`
- Docker build: `docker compose build && docker compose up -d`

## Project Structure

```
kitchen-mcp/
├── src/
│   ├── server/
│   │   ├── create-server.ts        # MCP server creation, tool registration, stdio + HTTP
│   │   └── tools/
│   │       ├── handler.ts          # toolHandler wrapper (catches errors → structured JSON)
│   │       ├── system.ts           # health + capabilities (2 tools)
│   │       ├── locations.ts        # location CRUD + tree (3 tools)
│   │       ├── ingredients.ts      # ingredient catalog + alias search (4 tools)
│   │       ├── inventory.ts        # lot-level inventory + transactions (7 tools)
│   │       ├── equipment.ts        # equipment + calibration (6 tools)
│   │       ├── measurements.ts     # unit conversion (3 tools)
│   │       ├── recipes.ts          # recipe CRUD, versioning, scaling (9 tools)
│   │       ├── restrictions.ts     # allergen/restriction CRUD (3 tools)
│   │       ├── preferences.ts      # preference CRUD + profile (3 tools)
│   │       ├── matching.ts         # recipe match/scoring engine (1 tool)
│   │       ├── sessions.ts         # cooking session lifecycle (15 tools)
│   │       └── timers.ts           # kitchen timers (9 tools)
│   ├── domain/
│   │   ├── locations/              # service.ts, types.ts
│   │   ├── ingredients/            # service.ts, types.ts
│   │   ├── inventory/              # service.ts, types.ts
│   │   ├── equipment/              # service.ts, types.ts
│   │   ├── measurements/           # service.ts (unit conversion engine)
│   │   ├── recipes/                # service.ts, types.ts
│   │   ├── matching/               # service.ts, types.ts, restriction-service.ts, preference-service.ts
│   │   └── sessions/               # service.ts, types.ts, timer-service.ts
│   ├── infrastructure/
│   │   ├── database/
│   │   │   ├── connection.ts       # SQLite WAL, FK, busy_timeout
│   │   │   ├── migrate.ts          # 6 migrations
│   │   │   └── migrations/         # 001–006
│   │   ├── audit.ts                # audit log write + query
│   │   ├── idempotency.ts          # hash-based dedup with TTL
│   │   └── logging.ts              # pino logger
│   └── shared/
│       ├── response.ts             # {ok, status, code, data, warnings, ...} envelope
│       ├── errors/catalogue.ts      # KitchenError + 35+ error codes
│       ├── ids.ts                  # UUID-based IDs with prefixes (loc_, ing_, ilot_, etc.)
│       └── time.ts                 # UTC timestamp helpers
├── tests/unit/                     # vitest tests (errors, response, ids)
├── data/                           # kitchen.db (Docker volume mount)
├── Dockerfile                      # node:20, native deps
├── docker-compose.yml              # source mount, port 3100, kitchen-data volume
├── KITCHEN_MCP_ARCHITECTURE.md     # Full architecture spec (3300+ lines)
└── AGENTS.md                       # This file
```

## Project Rules

- All tools return structured JSON via the `success()` / `toolHandler()` envelope — never return raw strings or plain text errors
- SQLite runs in WAL mode with foreign keys and busy_timeout=5000
- IDs are UUID-based with type prefixes (recipe_, rv_, ss_, session_, timer_, etc.)
- All timestamps are UTC ISO strings
- Recipe versions are immutable once used in cooking sessions
- Session steps are immutable copies from recipe steps (recipe edits don't affect active sessions)
- The server is the authoritative source of truth for kitchen state — LLM is never authoritative
- Inventory deductions happen via transactions, never direct overwrites
- `hh_default` is the default household for local single-user mode
- `person_default` is the default person for restriction/preference lookups
- `better-sqlite3` is used for sync API — never use async sqlite drivers
- SDK pinned to `@modelcontextprotocol/sdk` v1 (stable), not v2 (beta)
- Zod is a peer dependency of the MCP SDK, version 3.25
- Node >=20 required
- Server runs via `tsx` in Docker (source mounted, no rebuild needed for source changes only)
- HTTP transport uses `0.0.0.0` host to disable DNS rebinding for LAN access
- Docker container is `kitchen-mcp`, data persists in `kitchen-mcp_kitchen-data` volume

## Known Issues

- The `inventory_lots` table has a `version` integer column for optimistic locking but the inventory service doesn't use it yet — inventory adjustments are not concurrency-safe
- `kitchen_session_adjust_servings` directly updates the DB instead of going through the service (needs refactor)
- No timer tick/polling mechanism is wired up — `kitchen_timer_tick` must be called manually or by the agent to expire timers
- `session_ingredient_reservations` table exists but reservation logic is not wired into `session_start` yet — sessions don't actually reserve inventory on start
- Each HTTP request creates a fresh MCP server + DB connection — no connection pooling or shared state between requests
- Tests are minimal (only 3 test files: errors, response, ids)

## Fix Patterns

- When adding new error codes, add them to `src/shared/errors/catalogue.ts` ErrorCode object — use `SESSION_STATE_CONFLICT` for session/timer state errors, `INVALID_STATE_TRANSITION` for timer state errors, `NOT_FOUND` for missing entities
- When adding new tools, create the tool file in `src/server/tools/`, export a `register*Tools(ctx: ServerContext)` function, then call it in `create-server.ts`
- When adding new domain tables, create a migration in `src/infrastructure/database/migrations/`, add it to the migrations array in `migrate.ts`
- `db.prepare().all()` returns `unknown[]` — map callbacks need explicit cast: `.map((row) => rowToFoo(row as FooRow))`
- For Zod schemas on tool inputs, use `z.string().optional()` for optional params and `.describe()` on every field
- Docker container uses source mount — only need `docker restart kitchen-mcp` after code changes, no rebuild unless package.json changes

## User Preferences

- Prefers building incrementally, phase by phase
- Wants working smoke tests after each phase
- Uses dictation mode, words may be phonetically similar
- Wants clean, working code before moving on — no half-done phases

## Do Not Do

- Do not return raw text errors from tool handlers — always use `toolHandler()` wrapper and `kitchenError()` / `success()`
- Do not use `ErrorCode.CONFLICT` — it doesn't exist. Use `SESSION_STATE_CONFLICT`, `INVALID_STATE_TRANSITION`, `INVENTORY_STATE_CONFLICT`, etc.
- Do not modify recipe versions after they've been used in sessions
- Do not use async sqlite drivers — `better-sqlite3` is sync by design
- Do not assume `db.prepare().all()` returns typed arrays — always cast
- Do not create new AGENTS.md sections — keep it clean and merge into existing sections
- Do not store secrets or tokens in this file
- Do not add unnecessary governance files (CODE_OF_CONDUCT, CONTRIBUTING, etc.)
