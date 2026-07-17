# Kitchen MCP — Agent Skill Guide

This guide teaches an LLM how to use the Kitchen MCP tools effectively.

## What This Server Does

Kitchen MCP is the **authoritative source of truth** for kitchen state. It manages inventory, recipes, equipment, cooking sessions, timers, restrictions, and preferences. All calculations, validations, and state changes happen on the server — the LLM never stores or computes kitchen state.

## Core Principles

1. **Always query the server first** — never assume what's in inventory, what equipment exists, or what restrictions apply
2. **Use structured tools** — every tool returns structured JSON; parse the `data` field for results
3. **The server is the source of truth** — if the server says you have 3 eggs, you have 3 eggs
4. **Cooking sessions track state** — start a session to guide cooking, don't just describe steps
5. **Timers must be created on the server** — never rely on conversation time for cooking timers

## Tool Categories

### System (2 tools)
- `kitchen_system_health` — check if server is alive, DB status, migration state
- `kitchen_system_capabilities` — list what features are enabled

### Kitchen Map (3 tools)
- `kitchen_location_list` — browse locations (rooms, shelves, cabinets, drawers)
- `kitchen_location_get` — get one location with children
- `kitchen_location_create` — add new locations (e.g., "top shelf", "fridge door")

### Ingredients (4 tools)
- `kitchen_ingredient_search` — search by name or alias (handles local names, misspellings)
- `kitchen_ingredient_get` — get one ingredient details
- `kitchen_ingredient_create` — add new ingredients to the catalog
- `kitchen_ingredient_add_alias` — add local/nickname for an ingredient

### Inventory (7 tools)
- `kitchen_inventory_search` — find what's in stock (filter by ingredient, location, state, expiry)
- `kitchen_inventory_get` — get one lot with transaction history
- `kitchen_inventory_add` — add a new lot (e.g., "Amul Taaza 500ml")
- `kitchen_inventory_adjust` — correct quantity (e.g., "actually only 3 left")
- `kitchen_inventory_consume` — use up quantity (deducts, creates transaction)
- `kitchen_inventory_move` — move lot to different location
- `kitchen_inventory_expiring` — items expiring soon

### Equipment (6 tools)
- `kitchen_equipment_list` — browse equipment
- `kitchen_equipment_get` — get one item
- `kitchen_equipment_add` — register new equipment
- `kitchen_equipment_update` — edit details
- `kitchen_equipment_set_availability` — mark in-use or unavailable
- `kitchen_equipment_calibrate_container` — calibrate containers (actual volume vs label)

### Measurements (3 tools)
- `kitchen_measurement_convert` — convert between units (g↔kg, ml↔l, tsp↔tbsp↔cup)
- `kitchen_measurement_express_household` — express metric amounts using calibrated containers
- `kitchen_measurement_estimate_piece_weight` — get average piece weight for an ingredient

### Recipes (9 tools)
- `kitchen_recipe_search` — search by name, cuisine, meal type, difficulty
- `kitchen_recipe_get` — full recipe with version, ingredients, steps, equipment
- `kitchen_recipe_create` — create a draft recipe
- `kitchen_recipe_create_version` — add version with ingredients, steps, equipment
- `kitchen_recipe_validate` — check recipe for completeness
- `kitchen_recipe_publish_version` — make version active (validates first)
- `kitchen_recipe_deprecate` — retire a recipe
- `kitchen_recipe_check_availability` — can I make this with current inventory?
- `kitchen_recipe_scale` — scale to different serving count

### Restrictions & Preferences (7 tools)
- `kitchen_restriction_list` — dietary restrictions for a person
- `kitchen_restriction_add` — add allergen, intolerance, religious/ethical restriction
- `kitchen_restriction_deactivate` — remove a restriction
- `kitchen_preference_list` — flavour/texture preferences (0-10 scale)
- `kitchen_preference_set` — set preference (spice heat, saltiness, sweetness, etc.)
- `kitchen_preference_profile` — get full preference profile
- `kitchen_recipe_match` — **find best recipes** for current inventory, restrictions, and preferences

### Cooking Sessions (16 tools)
- `kitchen_session_plan` — dry-run: see what you'd need without changing inventory
- `kitchen_session_start` — begin cooking: reserves ingredients, creates steps
- `kitchen_session_get` — full state: steps, events, reservations, usage
- `kitchen_session_get_next_actions` — what steps are ready to start?
- `kitchen_session_start_step` — mark step as in-progress
- `kitchen_session_complete_step` — finish step, record ingredient usage
- `kitchen_session_skip_step` — skip a step
- `kitchen_session_pause` — pause session
- `kitchen_session_resume` — resume paused session
- `kitchen_session_report_problem` — report cooking issue (too wet, burning, etc.)
- `kitchen_session_apply_recovery` — record recovery action
- `kitchen_session_substitute_ingredient` — swap ingredient mid-cook
- `kitchen_session_adjust_servings` — change serving count (before steps start)
- `kitchen_session_complete` — finalize: deduct inventory, release reservations
- `kitchen_session_abandon` — cancel session
- `kitchen_session_list` — list sessions for a household

### Timers (9 tools)
- `kitchen_timer_create` — set a timer (optionally tied to a session/step)
- `kitchen_timer_list_active` — what timers are running?
- `kitchen_timer_get` — check one timer
- `kitchen_timer_pause` — pause a running timer
- `kitchen_timer_resume` — resume paused timer
- `kitchen_timer_extend` — add more time
- `kitchen_timer_acknowledge` — mark expired timer as seen
- `kitchen_timer_cancel` — cancel a timer
- `kitchen_timer_tick` — check for expired timers (call periodically)

## Common Workflows

### "What can I cook right now?"
1. `kitchen_inventory_search` — see what's available
2. `kitchen_recipe_match` with `servings` — get scored recipe suggestions
3. Present top matches with scores and reasons

### "I want to cook [recipe]"
1. `kitchen_recipe_search` to find the recipe
2. `kitchen_recipe_get` for full details
3. `kitchen_recipe_check_availability` — can we make it?
4. `kitchen_session_plan` — dry run
5. `kitchen_session_start` — begin cooking
6. Guide through steps: `start_step` → `complete_step` → next steps
7. Create timers with `kitchen_timer_create` for timed steps
8. `kitchen_session_complete` when done

### "Add [item] to inventory"
1. `kitchen_ingredient_search` — check if ingredient exists in catalog
2. If not: `kitchen_ingredient_create` — add to catalog first
3. `kitchen_inventory_add` — add lot with quantity, unit, label

### "I have a food allergy to [X]"
1. `kitchen_restriction_add` with `restriction_type: 'allergy'` and `ingredient_id` or `ingredient_category`
2. Future `kitchen_recipe_match` calls will automatically exclude recipes with that allergen

### "Set a timer for [X] minutes"
1. `kitchen_timer_create` with `name`, `duration_seconds`, optionally `session_id`

### "What's expiring soon?"
1. `kitchen_inventory_expiring` — items sorted by urgency

## Response Format

Every tool returns:
```json
{
  "ok": true/false,
  "status": "success" or "error",
  "code": "TOOL_SPECIFIC_CODE",
  "data": { ... },
  "warnings": [],
  "requires_confirmation": false
}
```

Always check `ok` before processing `data`. If `ok` is false, the `code` tells you what went wrong.

## Important Notes

- **IDs matter**: ingredient IDs, lot IDs, recipe IDs, session IDs — always use the IDs returned by the server
- **Unit consistency**: when adding inventory or creating recipe ingredients, use consistent units (g, ml, piece, tsp, etc.)
- **Session lifecycle**: sessions go `planned → active → completed` or `active → paused → active → completed`
- **Timer tick**: timers don't auto-expire — call `kitchen_timer_tick` periodically to check
- **One active session per household**: you can't start a new session while one is active
- **Recipe versions are immutable**: once published and used in a session, don't modify
- **Idempotency keys**: inventory operations accept `idempotency_key` to prevent duplicates
