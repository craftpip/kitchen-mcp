# Kitchen MCP — Agent Skill Guide

> A comprehensive guide to using Kitchen MCP — the authoritative kitchen state server with **80 tools** across **14 categories**.

---

## What This Server Does

Kitchen MCP is the **single source of truth** for your kitchen. It manages inventory down to individual lots, stores structured recipes with versioning, tracks cooking sessions step-by-step, runs timers, respects dietary restrictions, scores recipe matches against what's in stock, generates shopping lists, and plans meals across weeks.

The LLM talks to the user and decides *which* tool to call. The server does all the math, validation, safety checks, and state management. Never guess kitchen state — always query the server.

---

## Core Principles

| # | Principle | Why |
|---|-----------|-----|
| 1 | Query the server first | Never assume inventory, equipment, or restrictions |
| 2 | Use structured tools | Every tool returns predictable JSON — parse `data` |
| 3 | Server is authoritative | If it says 3 eggs, you have 3 eggs |
| 4 | Sessions track cooking | Start a session to guide, don't just narrate |
| 5 | Timers live on the server | Don't rely on conversation time for cooking |
| 6 | Shopping auto-subtracts | `generate_for_recipes` deducts current stock |
| 7 | Meal plans group by day | Validate before committing |

---

## Tool Reference

### `🔧` System — 2 tools

Server health and capability discovery.

| Tool | What it does |
|------|-------------|
| `kitchen_system_health` | Check server alive, DB status, migrations applied |
| `kitchen_system_capabilities` | List enabled domains (inventory, sessions, etc.) |

---

### `🔔` Notifications — ntfy.sh

Kitchen MCP sends push notifications via [ntfy.sh](https://ntfy.sh) when key events happen. Configure with `NTFY_TOPIC` in the environment (e.g. `NTFY_TOPIC=my-kitchen`). Notifications are sent automatically — no extra tool to call.

**Notification events:**

| Event | What gets sent | Tags | Priority |
|-------|---------------|------|----------|
| Timer expired | `⏰ Timer Expired: {name}` — name, duration, session | `timer`, `bell` | High |
| Cooking problem | `⚠️ Problem: {recipe}` — problem type, description | `warning`, `cooking` | High |
| Session complete | `✅ Done: {recipe}` — recipe name, duration | `tada`, `cooking` | Normal |
| Session abandoned | `🚫 Abandoned: {recipe}` — recipe name | `x`, `cooking` | Low |

If `NTFY_TOPIC` is not set, notifications are silently skipped — no errors, no log spam, no impact on kitchen operations.

---

### `📍` Locations — 3 tools

Nested storage hierarchy — rooms, shelves, drawers, bins.

| Tool | What it does |
|------|-------------|
| `kitchen_location_list` | Browse locations, optionally filter by parent |
| `kitchen_location_get` | Get one location with its children |
| `kitchen_location_create` | Add a new storage location |

---

### `🥕` Ingredient Catalog — 4 tools

Canonical ingredient definitions with aliases for local names.

| Tool | What it does |
|------|-------------|
| `kitchen_ingredient_search` | Search by name or alias (handles misspellings, local names) |
| `kitchen_ingredient_get` | Get canonical ingredient record |
| `kitchen_ingredient_create` | Add a new ingredient to the catalog |
| `kitchen_ingredient_add_alias` | Add a local name, nickname, or brand name |

---

### `📦` Inventory — 7 tools

Lot-level inventory with transaction history.

| Tool | What it does |
|------|-------------|
| `kitchen_inventory_search` | Find lots by ingredient, location, state, expiry |
| `kitchen_inventory_get` | Get one lot with full transaction history |
| `kitchen_inventory_add` | Add a new lot (e.g. "Amul Taaza 500ml") |
| `kitchen_inventory_adjust` | Correct a quantity (e.g. "actually only 3 left") |
| `kitchen_inventory_consume` | Deduct quantity, creates a transaction record |
| `kitchen_inventory_move` | Move lot to a different storage location |
| `kitchen_inventory_expiring` | List items sorted by expiry urgency |

---

### `🔪` Equipment — 6 tools

Kitchen tools, appliances, and calibrated containers.

| Tool | What it does |
|------|-------------|
| `kitchen_equipment_list` | Browse equipment, filter by capability/availability |
| `kitchen_equipment_get` | Get one equipment record |
| `kitchen_equipment_add` | Register new equipment |
| `kitchen_equipment_update` | Edit equipment details |
| `kitchen_equipment_set_availability` | Mark as available/in_use/dirty/broken/missing |
| `kitchen_equipment_calibrate_container` | Calibrate a container's actual volume |

---

### `📐` Measurements — 3 tools

Deterministic unit conversion with ingredient-aware density.

| Tool | What it does |
|------|-------------|
| `kitchen_measurement_convert` | Convert between units (g↔kg, ml↔l, tsp↔tbsp↔cup) |
| `kitchen_measurement_express_household` | Express metric amounts in calibrated containers |
| `kitchen_measurement_estimate_piece_weight` | Get average piece weight for an ingredient |

---

### `📖` Recipes — 9 tools

Structured, versioned recipes with ingredients, steps, dependencies, and equipment.

| Tool | What it does |
|------|-------------|
| `kitchen_recipe_search` | Search by name, cuisine, meal type, difficulty, max time |
| `kitchen_recipe_get` | Full recipe: version, ingredients, steps, equipment |
| `kitchen_recipe_create` | Create a draft recipe |
| `kitchen_recipe_create_version` | Add a new version with ingredients + steps + equipment |
| `kitchen_recipe_validate` | Check for missing quantities, invalid deps, gaps |
| `kitchen_recipe_publish_version` | Make a version active (validates first) |
| `kitchen_recipe_deprecate` | Retire a recipe (preserves history) |
| `kitchen_recipe_check_availability` | Can I make this with current inventory? |
| `kitchen_recipe_scale` | Scale ingredients to a target serving count |

---

### `⚠️` Restrictions & Preferences — 6 tools

Dietary restrictions and taste preferences per person.

| Tool | What it does |
|------|-------------|
| `kitchen_restriction_list` | List restrictions for a person |
| `kitchen_restriction_add` | Add allergen, intolerance, medical, religious, or dislike |
| `kitchen_restriction_deactivate` | Soft-delete a restriction (audited) |
| `kitchen_preference_list` | List taste preferences on a 0-10 scale |
| `kitchen_preference_set` | Set a preference dimension (spice_heat, saltiness, etc.) |
| `kitchen_preference_profile` | Get full preference profile for a person |

---

### `🎯` Recipe Matching — 1 tool

Multi-factor scoring engine — the smartest tool in the box.

| Tool | What it does |
|------|-------------|
| `kitchen_recipe_match` | Score all recipes against inventory, preferences, restrictions, equipment, expiry |

**Scoring breakdown:**

| Factor | Weight |
|--------|--------|
| Required ingredient coverage | 35% |
| Restriction & safety gate | **Mandatory** (blocks if violated) |
| Equipment compatibility | 15% |
| Time compatibility | 10% |
| Skill compatibility | 10% |
| Preference compatibility | 10% |
| Expiry utilization | 10% |
| Cleanup compatibility | 5% |
| Leftover utilization | 5% |

---

### `🍳` Cooking Sessions — 16 tools

Full lifecycle — plan, start, track steps, handle problems, complete.

| Tool | What it does |
|------|-------------|
| `kitchen_session_plan` | Dry-run: see what you'd need, no side effects |
| `kitchen_session_start` | Begin cooking: validates, reserves inventory, copies steps (immutable) |
| `kitchen_session_get` | Full state: steps, events, reservations, usage |
| `kitchen_session_get_next_actions` | What steps are ready? (dependency-aware) |
| `kitchen_session_start_step` | Mark a step as in-progress |
| `kitchen_session_complete_step` | Finish a step, unlock dependents, record usage |
| `kitchen_session_skip_step` | Skip an optional step |
| `kitchen_session_pause` | Pause the session (tracks paused duration) |
| `kitchen_session_resume` | Resume a paused session |
| `kitchen_session_report_problem` | Report issue (too wet, burning, undercooked...) — returns recovery rules |
| `kitchen_session_apply_recovery` | Apply a recovery action |
| `kitchen_session_substitute_ingredient` | Swap ingredient mid-cook (validated) |
| `kitchen_session_adjust_servings` | Change servings before incompatible steps start |
| `kitchen_session_complete` | Finalize: deduct inventory, release reservations, create leftovers |
| `kitchen_session_abandon` | Cancel session with ingredient disposition |
| `kitchen_session_list` | List all sessions for a household |

---

### `⏱️` Timers — 9 tools

Persistent timers that survive conversation restarts.

| Tool | What it does |
|------|-------------|
| `kitchen_timer_create` | Create a timer (optionally linked to session/step) |
| `kitchen_timer_list_active` | See all running and paused timers |
| `kitchen_timer_get` | Check one timer's status and remaining time |
| `kitchen_timer_pause` | Pause a running timer |
| `kitchen_timer_resume` | Resume a paused timer |
| `kitchen_timer_extend` | Add seconds to a running/paused/scheduled timer |
| `kitchen_timer_acknowledge` | Mark an expired timer as acknowledged |
| `kitchen_timer_cancel` | Cancel a timer |
| `kitchen_timer_tick` | Check for expired timers — **call periodically** |

---

### `🛒` Shopping — 11 tools

Smart shopping lists that know what you already have.

| Tool | What it does |
|------|-------------|
| `kitchen_shopping_list_create` | Create a new shopping list |
| `kitchen_shopping_list_get` | Get a list with all its items |
| `kitchen_shopping_list_list` | List all lists, optionally filter by status |
| `kitchen_shopping_item_add` | Add an item with quantity, priority, reason |
| `kitchen_shopping_item_update` | Change quantity, priority, status, or notes |
| `kitchen_shopping_item_remove` | Remove an item from a list |
| `kitchen_shopping_mark_purchased` | Mark item as bought (records actual quantity) |
| `kitchen_shopping_store_purchased_item` | Move into inventory (auto-creates a lot) |
| `kitchen_shopping_list_complete` | Mark list as completed |
| `kitchen_shopping_generate_for_recipes` | **Auto-generate**: subtracts inventory from recipe needs |
| `kitchen_shopping_generate_restock` | **Auto-generate**: items below minimum thresholds |

---

### `📅` Meal Planning — 11 tools

Plan your week, generate shopping lists, validate feasibility.

| Tool | What it does |
|------|-------------|
| `kitchen_meal_plan_create` | Create a draft plan with date range |
| `kitchen_meal_plan_get` | Get plan with all recipe entries |
| `kitchen_meal_plan_list` | List plans, filter by status |
| `kitchen_meal_plan_add_entry` | Assign a recipe to a specific date + meal type |
| `kitchen_meal_plan_update_entry` | Change recipe, servings, date, or meal type |
| `kitchen_meal_plan_remove_entry` | Remove an entry |
| `kitchen_meal_plan_validate` | Check recipes exist, are published, dates are in range |
| `kitchen_meal_plan_commit` | Commit draft → active (validates first) |
| `kitchen_meal_plan_complete` | Mark as completed |
| `kitchen_meal_plan_generate` | **Auto-generate**: picks recipes per slot, prioritises expiring ingredients |

---

## Common Workflows

### 🔍 "What can I cook right now?"

```
1. kitchen_inventory_search       → see current stock
2. kitchen_recipe_match(s)        → scored suggestions
3. Present top 5 with scores
```

The score factors: 35% ingredient coverage, 15% equipment, 10% time, 10% preferences, 10% expiry. Restriction failures are a hard block.

---

### 🍽️ "Let's cook [recipe]"

```
1. kitchen_recipe_search          → find the recipe (use name, cuisine, meal_type)
2. kitchen_recipe_get             → full details: ingredients, steps, equipment
3. kitchen_recipe_check_avail     → can we make it?
4. kitchen_session_plan           → dry run (no side effects)
5. kitchen_session_start          → begin! reserves ingredients, copies steps
6. Loop: start_step → complete_step → get_next_actions
7. kitchen_timer_create           → for timed steps
8. kitchen_session_complete       → finalize deductions
```

---

### 📦 "Add [item] to inventory"

```
1. kitchen_ingredient_search      → does it exist in the catalog?
2. (if no) kitchen_ingredient_create → add it first
3. kitchen_inventory_add          → lot with quantity, location, expiry
```

---

### 🥜 "I'm allergic to [X]"

```
1. kitchen_ingredient_search      → find the ingredient
2. kitchen_restriction_add        → type: 'allergy', severity: 'severe'
3. Done — future matches exclude it automatically
```

---

### 🛒 "What do I need to buy?"

```
1. kitchen_shopping_generate_for_recipes
   → pass recipe IDs + servings, server subtracts inventory
2. Review the list (only deficits)
3. kitchen_shopping_mark_purchased → as you shop
4. kitchen_shopping_store_purchased_item → auto-creates inventory lots
```

---

### 📋 "Restock my pantry"

```
1. Define thresholds: {ingredient, min_quantity, unit}[]
2. kitchen_shopping_generate_restock → only what's below threshold
```

---

### 📅 "Plan next week's meals"

```
1. kitchen_meal_plan_generate
   → date range, meal_types, servings
   → server picks recipes, prioritises expiring ingredients
2. kitchen_meal_plan_get          → review the plan
3. (optional) add_entry / update_entry / remove_entry
4. kitchen_meal_plan_validate     → check feasibility
5. kitchen_meal_plan_commit       → activate the plan
6. kitchen_shopping_generate_for_recipes → from plan entries
```

---

### ⏱️ "Set a timer for [X]"

```
1. kitchen_timer_create           → name, duration_seconds
2. kitchen_timer_tick             → call periodically to check expiry
3. kitchen_timer_acknowledge      → user saw it
```

---

## Response Format

Every tool returns:

```json
{
  "ok": true,
  "status": "success",
  "code": "INVENTORY_SEARCHED",
  "data": { "lots": [...], "count": 3 },
  "warnings": [],
  "requires_confirmation": false,
  "metadata": {
    "server_time": "2026-07-17T12:00:00Z"
  }
}
```

On error:

```json
{
  "ok": false,
  "status": "error",
  "code": "INSUFFICIENT_QUANTITY",
  "message": "Only 120 ml of milk is available",
  "details": { "requested": 200, "available": 120 },
  "recoverable": true,
  "suggested_actions": ["find_substitution", "reduce_servings"]
}
```

**Always check `ok` first.** If `false`, read `code` and `message` — errors are structured and often recoverable.

---

## Quick Reference

| Domain | Tools | Key Tool |
|--------|-------|----------|
| System | 2 | `kitchen_system_health` |
| Locations | 3 | `kitchen_location_list` |
| Ingredients | 4 | `kitchen_ingredient_search` |
| Inventory | 7 | `kitchen_inventory_search` |
| Equipment | 6 | `kitchen_equipment_list` |
| Measurements | 3 | `kitchen_measurement_convert` |
| Recipes | 9 | `kitchen_recipe_get` |
| Restrictions | 3 | `kitchen_restriction_add` |
| Preferences | 3 | `kitchen_preference_profile` |
| Matching | 1 | `kitchen_recipe_match` |
| Sessions | 16 | `kitchen_session_start` |
| Timers | 9 | `kitchen_timer_create` |
| Shopping | 11 | `kitchen_shopping_generate_for_recipes` |
| Meal Planning | 11 | `kitchen_meal_plan_generate` |
| **Total** | **80** | |

---

## Gotchas to Remember

- **Timer tick**: timers don't auto-fire. Call `kitchen_timer_tick` periodically.
- **Immutable sessions**: recipe edits don't affect active sessions — steps are copied at start.
- **Idempotency keys**: use them for inventory mutations to prevent double-deduction.
- **One session at a time**: can't start a new session while one is active.
- **Restrictions are hard gates**: matching excludes blocked recipes entirely.
- **Shopping subtracts inventory**: `generate_for_recipes` only adds what you're short on.
- **Validate before commit**: `kitchen_meal_plan_validate` catches issues before activation.
- **IDs are prefixed**: `lot_` for inventory lots, `spi_` for shopping items, `mpi_` for meal entries, etc.
