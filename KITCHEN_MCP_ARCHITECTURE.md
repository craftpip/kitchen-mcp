# Kitchen MCP

## Architecture and Technical Design Specification

**Document status:** Initial architecture
**Target:** Local-first Kitchen Model Context Protocol server
**Primary consumer:** An external LLM or agent designed separately
**Scope:** Kitchen data, kitchen operations, deterministic calculations, and cooking workflow support
**Out of scope:** Agent personality, system prompts, conversation design, unrestricted computer access, and autonomous general-purpose behaviour

---

# 1. Purpose

Kitchen MCP is a specialized MCP server that provides structured kitchen knowledge and controlled kitchen operations to an external LLM.

Its responsibilities are to:

1. Maintain an accurate inventory of food, equipment, utensils, and storage locations.
2. Store the user’s cooking-related preferences and practical cooking capabilities.
3. Maintain structured recipes and ingredient substitution rules.
4. Find recipes that can be prepared using available ingredients and equipment.
5. Guide and track active cooking sessions.
6. Perform deterministic calculations such as quantity conversion, portion scaling, inventory deduction, and recipe compatibility scoring.
7. Track leftovers, expiry, shopping requirements, cooking history, and user feedback.
8. Enforce kitchen and food-safety rules.
9. Expose all these capabilities through narrowly scoped MCP tools and resources.

The Kitchen MCP must not depend on an LLM for data integrity, mathematical calculations, safety validation, inventory state, timers, or transactional updates.

---

# 2. Core Design Principle

The Kitchen MCP is the authoritative kitchen system.

The external LLM may:

* interpret natural language;
* decide which Kitchen MCP tool to call;
* explain results;
* guide the user conversationally;
* ask the user for missing information.

The Kitchen MCP must:

* store facts;
* validate requests;
* calculate results;
* reject invalid operations;
* preserve state;
* track changes;
* enforce safety rules;
* return structured responses.

The LLM must never be treated as the source of truth for:

* available ingredients;
* item locations;
* quantities;
* expiry dates;
* allergens;
* timers;
* recipe amounts;
* inventory deductions;
* cooking-session progress;
* safety decisions.

---

# 3. MCP Protocol Strategy

MCP servers can expose tools, resources, and prompts. Kitchen MCP should primarily expose **tools** for operations and **resources** for stable or inspectable kitchen context. Prompts are not required because agent prompting is outside this project. MCP uses JSON-RPC-based communication and supports local `stdio` and remote Streamable HTTP transports.

## 3.1 MCP features to implement

### Required

* Tools
* Tool input schemas
* Structured tool results
* Server capability declaration
* Logging
* Graceful initialization and shutdown
* Consistent error responses

### Recommended

* Resources
* Resource templates
* Resource update notifications
* Tool-list change notifications, where supported
* Progress reporting for long-running imports
* Cancellation support
* Streamable HTTP authorization when remote access is enabled

### Not required for Version 1

* MCP prompts
* LLM sampling initiated by the server
* MCP Apps user interfaces
* External tool discovery
* Dynamic installation of plugins

MCP tools are individually named and described with schemas, while resources are addressable using URIs. This fits the Kitchen MCP model: actions become tools, while read-only snapshots and reference data can be resources.

---

# 4. High-Level Architecture

```text
┌──────────────────────────────────────────────┐
│          External LLM / MCP Client           │
│                                              │
│  Conversation, reasoning, user interaction   │
└──────────────────────┬───────────────────────┘
                       │ MCP
              stdio or Streamable HTTP
                       │
┌──────────────────────▼───────────────────────┐
│               Kitchen MCP Server             │
│                                              │
│  1. MCP Interface Layer                      │
│  2. Authentication and Policy Layer          │
│  3. Tool Orchestration Layer                 │
│  4. Domain Services                          │
│  5. Validation and Safety Engine             │
│  6. Event and Audit System                   │
│  7. Persistence Layer                        │
└──────────────┬──────────────┬────────────────┘
               │              │
      ┌────────▼───────┐  ┌──▼────────────────┐
      │ Kitchen DB     │  │ Optional Services │
      │                │  │                   │
      │ SQLite first   │  │ Barcode provider  │
      │ PostgreSQL     │  │ Nutrition source  │
      │ later          │  │ Notifications     │
      └────────────────┘  │ Image storage     │
                          └───────────────────┘
```

---

# 5. Architectural Layers

## 5.1 MCP Interface Layer

Responsible for:

* MCP server initialization;
* capability declaration;
* tool registration;
* resource registration;
* argument-schema validation;
* conversion of domain results into MCP responses;
* protocol-level errors;
* transport handling.

No business rules should be implemented directly inside tool handlers.

A tool handler should:

1. Validate the request envelope.
2. Build a domain command.
3. Call the appropriate service.
4. Convert the service result into a standard MCP response.

---

## 5.2 Authorization and Policy Layer

Responsible for:

* determining which caller may access the server;
* distinguishing read and write access;
* blocking dangerous or unsupported operations;
* enforcing approval requirements;
* restricting remote access;
* rate limiting;
* recording the caller identity where available.

Suggested roles:

```text
kitchen.read
kitchen.write
kitchen.admin
kitchen.safety_admin
```

For a local single-user deployment, these roles may initially map to one trusted local user. They should still exist conceptually so remote or multi-user support can be added later.

---

## 5.3 Domain Service Layer

Recommended domain services:

```text
InventoryService
LocationService
IngredientCatalogService
EquipmentService
PreferenceService
HouseholdService
RecipeService
RecipeMatchingService
SubstitutionService
MeasurementService
MealPlanningService
CookingSessionService
TimerService
ShoppingService
ExpiryService
NutritionService
SafetyService
CleaningService
HistoryService
ImportExportService
AuditService
```

Each service owns its own domain rules but uses a common database transaction layer.

---

## 5.4 Validation Layer

Validation occurs at four levels:

### Schema validation

Checks:

* required fields;
* data types;
* allowed enum values;
* minimum and maximum values;
* date formats;
* identifier formats.

### Domain validation

Checks:

* whether an item exists;
* whether a destination location exists;
* whether units are compatible;
* whether sufficient quantity exists;
* whether a recipe version is valid;
* whether an active session is in the expected state.

### Safety validation

Checks:

* allergen conflicts;
* food-state conflicts;
* unsafe equipment operations;
* cross-contamination risks;
* unsafe storage;
* expired or uncertain food;
* prohibited appliance actions.

### Transaction validation

Checks:

* whether the record changed since it was read;
* whether duplicate operations were submitted;
* whether the update can be applied atomically.

---

## 5.5 Persistence Layer

### Recommended initial database

Use SQLite for the first local version because Kitchen MCP is primarily a single-household, local-first application.

Requirements:

* foreign keys enabled;
* Write-Ahead Logging enabled;
* migrations;
* database backups;
* transactions around multi-table updates;
* indexes on common lookup fields;
* application-generated UUIDs or ULIDs;
* UTC timestamps in storage;
* configurable display timezone.

PostgreSQL can replace SQLite later without changing the domain contracts.

### File storage

Do not store large binary images directly in primary database tables.

Store:

* local file path or object-storage key;
* media type;
* checksum;
* creation date;
* source;
* related entity ID.

---

# 6. Domain Model

## 6.1 Household

Represents the kitchen-owning unit.

```yaml
household_id: hh_01
name: Home Kitchen
default_timezone: Asia/Kolkata
default_language: en
default_currency: INR
default_measurement_system: metric
created_at: timestamp
updated_at: timestamp
```

Kitchen MCP should support one household initially but keep `household_id` in all appropriate tables.

---

## 6.2 People

Used for serving counts, preferences, restrictions, and household-specific meal planning.

```yaml
person_id: person_01
household_id: hh_01
display_name: Primary user
active: true
default_portion_multiplier: 1.0
```

Sensitive health-related information should remain optional and explicitly user-entered.

---

## 6.3 Ingredient Catalog

This is the canonical definition of an ingredient, separate from physical inventory.

```yaml
ingredient_id: ingredient_red_onion
canonical_name: red_onion
display_name: Red onion
category: vegetable
subcategory: allium
default_unit: gram
density_g_per_ml: null
average_piece_weight_g: 110
perishable: true
default_storage_type: refrigerated
aliases:
  - onion
  - purple onion
  - lal pyaz
  - kanda
allergens: []
dietary_tags:
  - vegan
  - vegetarian
```

The catalog answers:

* What is this ingredient?
* Which names refer to it?
* Which units can measure it?
* What general food category does it belong to?

It does not answer:

* How much is currently available?
* Where is the physical item?
* When was the current packet opened?

Those belong to inventory records.

---

## 6.4 Ingredient Aliases

Aliases should be stored separately for search and language support.

```yaml
alias_id: alias_123
ingredient_id: ingredient_red_onion
alias: kanda
language: mr
region: Maharashtra
alias_type: local_name
confidence: verified
```

Alias types:

```text
canonical
common_name
local_name
brand_name
user_nickname
misspelling
transliteration
```

User nicknames should not overwrite canonical ingredient names.

---

## 6.5 Storage Locations

Locations must support nesting.

```yaml
location_id: location_fridge_veg_left
household_id: hh_01
parent_location_id: location_fridge
name: Left vegetable drawer
location_type: drawer
storage_environment: refrigerated
temperature_min_c: 1
temperature_max_c: 5
position_order: 10
active: true
```

Example hierarchy:

```text
Kitchen
├── Fridge
│   ├── Top shelf
│   ├── Middle shelf
│   ├── Door
│   ├── Left vegetable drawer
│   └── Right vegetable drawer
├── Freezer
├── Pantry
│   ├── Cabinet 1
│   └── Cabinet 2
├── Drawer 1
├── Drawer 2
├── Counter
└── Temporary or unknown
```

Every inventory item should have either:

* one confirmed location;
* an explicitly unknown location;
* several candidate locations with confidence values.

The system must not silently assign a location.

---

## 6.6 Inventory Lots

Use lot-level inventory rather than one total row per ingredient.

Two milk packets may have different:

* expiry dates;
* open states;
* sizes;
* locations;
* brands;
* purchase dates.

```yaml
inventory_lot_id: lot_abc123
household_id: hh_01
ingredient_id: ingredient_milk
display_label: Amul Taaza 500 ml
brand: Amul
quantity_value: 320
quantity_unit: ml
quantity_precision: measured
location_id: location_fridge_door
state: opened
opened_at: timestamp
purchased_at: timestamp
printed_expiry_at: timestamp
estimated_expiry_at: null
expiry_confidence: printed
barcode: "890..."
notes: null
version: 4
created_at: timestamp
updated_at: timestamp
```

### Inventory states

```text
sealed
opened
washed
peeled
cut
prepared
cooked
frozen
thawing
marinating
spoiled
discarded
consumed
unknown
```

Multiple food-state attributes may be required. A normalized state-event model is better than forcing all conditions into one enum.

Example:

```yaml
base_state: opened
preparation_state: chopped
temperature_state: refrigerated
safety_state: usable
```

---

## 6.7 Inventory Quantity Confidence

Quantities may be exact or approximate.

```text
measured
package_declared
piece_estimate
visual_estimate
user_estimate
unknown
```

Example:

```yaml
quantity_value: 0.5
quantity_unit: packet
quantity_precision: visual_estimate
```

Tools must return the confidence source alongside quantities.

---

## 6.8 Equipment

```yaml
equipment_id: equipment_pressure_cooker_01
household_id: hh_01
name: 5-litre pressure cooker
equipment_type: pressure_cooker
capacity_value: 5
capacity_unit: litre
manufacturer: null
model: null
condition: working
available: true
location_id: location_cabinet_2
capabilities:
  - pressure_cook
  - boil
  - steam
safety_profile_id: safety_pressure_cooker_basic
```

Equipment types include:

```text
stove
burner
induction_cooktop
oven
microwave
air_fryer
pressure_cooker
rice_cooker
kadai
pan
saucepan
pot
knife
chopping_board
mixer
blender
weighing_scale
measuring_cup
measuring_spoon
storage_container
thermometer
strainer
```

---

## 6.9 Container Calibration

Household containers can become measurement units.

```yaml
container_id: container_blue_katori
equipment_id: equipment_blue_katori
capacity_ml: 180
capacity_confidence: measured
tare_weight_g: 92
```

The measurement engine can then translate:

```text
180 ml → 1 blue katori
90 ml → 0.5 blue katori
```

---

## 6.10 Preferences

Preferences must be structured, scoped, and evidence-based.

```yaml
preference_id: pref_01
person_id: person_01
dimension: spice_heat
value_numeric: 6
scale_min: 0
scale_max: 10
context:
  dish_category: curry
confidence: confirmed
source: explicit_user_statement
created_at: timestamp
updated_at: timestamp
```

Preference dimensions may include:

```text
spice_heat
saltiness
sweetness
sourness
bitterness
oiliness
garlic_intensity
ginger_intensity
onion_visibility
crispness
creaminess
softness
mushiness
chunk_size
gravy_thickness
serving_temperature
```

Preference scopes:

```text
global
ingredient
dish
dish_category
cooking_method
meal_type
```

Preference sources:

```text
explicit_user_statement
meal_feedback
repeated_inference
manual_import
```

An inferred preference must not automatically become a confirmed preference.

---

## 6.11 Dietary Restrictions and Allergens

Keep these separate from taste preferences.

```yaml
restriction_id: restriction_01
person_id: person_01
restriction_type: allergy
ingredient_id: ingredient_peanut
severity: severe
cross_contamination_sensitive: true
source: user_entered
active: true
```

Restriction types:

```text
allergy
intolerance
medical
religious
ethical
temporary
dislike
```

A dislike must never trigger the same enforcement behaviour as an allergy unless configured.

---

## 6.12 Cooking Skills

```yaml
skill_id: skill_pressure_cooker
person_id: person_01
skill_type: pressure_cooker_use
level: beginner
guidance_level: detailed
requires_safety_reminders: true
successful_attempts: 0
failed_attempts: 0
last_attempt_at: null
```

Levels:

```text
unknown
never_attempted
beginner
comfortable
experienced
```

This data is exposed to the external LLM, but Kitchen MCP does not control conversational wording.

---

# 7. Recipe Model

Recipes must be structured and versioned.

## 7.1 Recipe

```yaml
recipe_id: recipe_masala_omelette
name: Masala omelette
description: Basic two-egg masala omelette
cuisine: Indian
meal_types:
  - breakfast
  - snack
difficulty: beginner
default_servings: 1
active_version_id: recipe_version_03
status: tested
source_type: user_entered
```

Recipe status:

```text
draft
imported_unverified
verified
tested
deprecated
```

---

## 7.2 Recipe Version

Never overwrite a recipe that has already been used in a cooking session.

```yaml
recipe_version_id: recipe_version_03
recipe_id: recipe_masala_omelette
version_number: 3
yield_value: 1
yield_unit: serving
prep_time_minutes: 8
cook_time_minutes: 6
rest_time_minutes: 0
created_at: timestamp
change_summary: Reduced onion quantity
```

---

## 7.3 Recipe Ingredients

```yaml
recipe_ingredient_id: ri_01
recipe_version_id: recipe_version_03
ingredient_id: ingredient_egg
quantity_value: 2
quantity_unit: piece
quantity_min: 2
quantity_max: 2
required: true
preparation: beaten
usage_role: structure
group_name: omelette
sort_order: 10
```

Additional fields:

```text
optional
garnish
to_taste
divisible
allow_partial_inventory
preparation_notes
temperature_requirement
```

---

## 7.4 Recipe Steps

```yaml
recipe_step_id: step_04
recipe_version_id: recipe_version_03
sequence_number: 4
title: Cook the first side
action_type: pan_fry
instruction_data:
  heat_level: medium_low
  duration_min_seconds: 90
  duration_max_seconds: 150
  completion_signs:
    - edges look set
    - surface is mostly no longer liquid
required_equipment:
  - equipment_type: frying_pan
timer_recommended: true
safety_rule_ids: []
```

Avoid storing only one free-text paragraph.

The structured step should support:

* ingredients used;
* quantities used;
* required tools;
* action type;
* heat level;
* timing range;
* completion indicators;
* dependencies;
* parallelizable flag;
* safety checks;
* recovery actions.

A human-readable instruction may also be stored, but it must not replace structured fields.

---

## 7.5 Recipe Dependencies

```yaml
step_id: step_06
depends_on:
  - step_04
  - step_05
parallelizable_with:
  - step_03
```

This supports deterministic prep timelines.

---

## 7.6 Recipe Failure and Recovery Rules

```yaml
recovery_rule_id: recovery_omelette_too_wet
recipe_version_id: recipe_version_03
symptom: surface_remains_liquid
applicable_step_id: step_04
conditions:
  elapsed_seconds_min: 120
actions:
  - lower_heat
  - cover_pan
  - cook_additional_seconds: 45
severity: recoverable
```

---

# 8. Substitution Model

Substitution must be role-aware.

```yaml
substitution_rule_id: sub_lemon_vinegar
original_ingredient_id: ingredient_lemon_juice
substitute_ingredient_id: ingredient_white_vinegar
conversion_ratio: 0.5
original_unit: tbsp
substitute_unit: tbsp
valid_roles:
  - acidity
valid_dish_categories:
  - marinade
  - chutney
invalid_recipes:
  - lemon_rice
flavour_difference: noticeable
confidence: verified
```

Substitution evaluation should consider:

* ingredient role;
* dish category;
* cooking method;
* quantity;
* allergens;
* dietary restrictions;
* available inventory;
* flavour impact;
* texture impact;
* recipe-specific exclusions.

The engine must be allowed to return:

```text
No safe or suitable substitution found.
```

It must not always produce a substitute.

---

# 9. Cooking Sessions

Cooking sessions must be explicit persistent entities.

```yaml
session_id: session_20260717_001
household_id: hh_01
recipe_version_id: recipe_version_03
servings: 2
status: active
current_step_id: step_04
started_at: timestamp
paused_at: null
completed_at: null
session_version: 8
```

Session states:

```text
planned
preparing
active
paused
completed
abandoned
failed
```

---

## 9.1 Session Steps

Copy recipe steps into session-step records when the session starts.

This ensures later recipe edits do not modify an active cooking session.

```yaml
session_step_id: ss_04
session_id: session_20260717_001
source_recipe_step_id: step_04
status: active
started_at: timestamp
completed_at: null
actual_duration_seconds: null
notes: null
```

Step states:

```text
pending
ready
active
completed
skipped
failed
blocked
```

---

## 9.2 Ingredient Reservations

Starting a session should reserve planned ingredients.

```yaml
reservation_id: reserve_01
session_id: session_20260717_001
inventory_lot_id: lot_egg_01
reserved_quantity: 4
reserved_unit: piece
status: active
```

Reservation prevents two simultaneous sessions from assuming the same food is available.

Inventory should be permanently deducted only when:

* the ingredient is confirmed used; or
* the session completes under configured automatic-consumption rules.

---

## 9.3 Session Events

Every action should produce an immutable event.

```yaml
event_id: event_01
session_id: session_20260717_001
event_type: step_completed
event_data:
  step_id: ss_03
created_at: timestamp
actor_type: mcp_client
request_id: req_123
```

Useful event types:

```text
session_started
session_paused
session_resumed
step_started
step_completed
step_skipped
timer_created
timer_expired
ingredient_used
ingredient_substituted
quantity_adjusted
problem_reported
recovery_applied
session_completed
session_abandoned
```

---

# 10. Timers

Timers must be persisted outside the LLM conversation.

```yaml
timer_id: timer_onion_01
session_id: session_20260717_001
name: Check onions
timer_type: check
status: running
duration_seconds: 180
started_at: timestamp
due_at: timestamp
paused_remaining_seconds: null
```

Timer types:

```text
check
cook
rest
soak
marinate
cool
defrost
reminder
```

Timer states:

```text
scheduled
running
paused
expired
acknowledged
cancelled
```

A timer expiring does not necessarily mean the food is ready.

The result should distinguish:

```yaml
timer_status: expired
meaning: inspect_food
completion_claim: false
```

Kitchen MCP may expose timer status but should not depend on the MCP connection remaining open.

A background scheduler must continue running independently of an active conversation.

---

# 11. Inventory Transaction Model

Do not directly overwrite quantities without creating transaction records.

```yaml
inventory_transaction_id: tx_01
inventory_lot_id: lot_milk_01
transaction_type: consumed
quantity_delta: -100
unit: ml
reason: recipe_use
session_id: session_01
created_at: timestamp
idempotency_key: session01-step03-milk
```

Transaction types:

```text
acquired
consumed
discarded
adjusted
transferred
split
merged
converted
reserved
reservation_released
```

Current quantity may be stored for performance, but transaction history remains the audit source.

---

# 12. Leftovers and Prepared Components

A completed recipe may create new inventory lots.

Example:

```text
Raw ingredients consumed
        ↓
Cooked dal batch created
        ↓
Two portions served
        ↓
One leftover portion stored
```

```yaml
inventory_lot_id: lot_cooked_dal_01
ingredient_id: ingredient_prepared_dal
source_recipe_version_id: recipe_dal_v2
source_session_id: session_01
quantity_value: 1
quantity_unit: serving
state: cooked
cooked_at: timestamp
location_id: fridge_top_shelf
estimated_expiry_at: timestamp
```

Prepared food should retain lineage to the recipe and session that created it.

---

# 13. Shopping Model

## 13.1 Shopping Lists

```yaml
shopping_list_id: shopping_weekly_01
household_id: hh_01
name: Weekly groceries
status: active
created_at: timestamp
```

## 13.2 Shopping Items

```yaml
shopping_item_id: shopping_item_01
shopping_list_id: shopping_weekly_01
ingredient_id: ingredient_egg
requested_quantity: 12
requested_unit: piece
priority: required
reason: planned_recipes
preferred_brand: null
status: needed
```

Statuses:

```text
needed
approved
ordered
purchased
stored
cancelled
unavailable
```

Kitchen MCP Version 1 generates and manages shopping lists. It does not purchase anything.

---

# 14. Meal Planning Model

```yaml
meal_plan_id: plan_01
household_id: hh_01
start_date: 2026-07-18
end_date: 2026-07-20
status: draft
```

```yaml
meal_plan_entry_id: entry_01
meal_plan_id: plan_01
date: 2026-07-18
meal_type: dinner
recipe_version_id: recipe_dal_v2
servings: 2
priority_reason:
  - uses_expiring_tomatoes
```

The planner should consider:

* current inventory;
* expiry urgency;
* user restrictions;
* preferences;
* equipment;
* cooking skill;
* time limits;
* serving count;
* leftover reuse;
* requested variety;
* maximum cleanup effort;
* shopping constraints.

---

# 15. Safety Architecture

Safety should be a first-class deterministic subsystem.

## 15.1 Safety Rules

```yaml
safety_rule_id: rule_raw_chicken_board
category: cross_contamination
severity: critical
trigger:
  ingredient_category: raw_poultry
  equipment_type: chopping_board
required_actions:
  - mark_equipment_contaminated
  - require_cleaning_before_ready_to_eat_food
blocking: true
```

Rule categories:

```text
allergen
cross_contamination
temperature
storage
expiry
pressure
hot_oil
open_flame
knife
electrical
chemical
reheating
raw_food
```

---

## 15.2 Safety Outcomes

```text
allowed
allowed_with_warning
requires_confirmation
blocked
unknown
```

Example:

```yaml
status: blocked
code: PRESSURE_COOKER_UNSAFE_OPEN
message: Pressure release has not been confirmed.
required_conditions:
  - heat_off
  - pressure_indicator_down
  - no_active_steam_release
```

The server must not offer an “ignore safety” boolean on ordinary tools.

Exceptional administrative overrides should require a separate privileged path and must be audited.

---

## 15.3 Safety Uncertainty

When information is insufficient:

```yaml
status: unknown
missing_information:
  - time_left_at_room_temperature
  - current_food_temperature
recommended_action: do_not_consume_until_verified
```

The server must distinguish “unknown” from “safe.”

---

# 16. Tool Design Principles

Every tool should:

1. Perform one clear operation.
2. Have an explicit typed input schema.
3. Return structured data.
4. Include stable machine-readable status codes.
5. Avoid accepting arbitrary SQL or file paths.
6. Avoid accepting vague free-form instructions when structured fields are possible.
7. Support an idempotency key for state-changing operations.
8. Return the entity version after writes.
9. Clearly report uncertainty.
10. Avoid hiding partial failures.

Tool names should follow one naming convention:

```text
kitchen_<domain>_<action>
```

Examples:

```text
kitchen_inventory_search
kitchen_inventory_add
kitchen_recipe_match
kitchen_session_start
```

---

# 17. Standard Tool Response

Every tool should return a consistent response envelope.

```json
{
  "ok": true,
  "status": "success",
  "code": "INVENTORY_ITEM_CREATED",
  "data": {},
  "warnings": [],
  "requires_confirmation": false,
  "confirmation": null,
  "metadata": {
    "request_id": "req_123",
    "server_time": "2026-07-17T09:00:00Z"
  }
}
```

Failure:

```json
{
  "ok": false,
  "status": "error",
  "code": "INSUFFICIENT_QUANTITY",
  "message": "Only 120 ml of milk is available.",
  "details": {
    "requested": {
      "value": 200,
      "unit": "ml"
    },
    "available": {
      "value": 120,
      "unit": "ml"
    }
  },
  "recoverable": true,
  "suggested_actions": [
    "reduce_recipe_servings",
    "find_substitution"
  ],
  "metadata": {
    "request_id": "req_123"
  }
}
```

---

# 18. Kitchen MCP Tool Catalogue

## 18.1 System Tools

### `kitchen_system_health`

Returns:

* server version;
* database status;
* migration status;
* timer scheduler status;
* storage status;
* enabled optional integrations.

### `kitchen_system_capabilities`

Returns domain capabilities such as:

```text
inventory
locations
recipes
sessions
timers
shopping
meal_planning
nutrition
barcode_lookup
image_analysis
```

### `kitchen_system_export`

Exports structured kitchen data.

Must support redaction options and must not export secrets.

### `kitchen_system_import`

Imports a validated Kitchen MCP backup or seed dataset.

Must support dry-run validation.

---

## 18.2 Location Tools

### `kitchen_location_list`

Inputs:

```yaml
parent_location_id: optional
include_inactive: false
```

### `kitchen_location_get`

Inputs:

```yaml
location_id: required
include_children: true
```

### `kitchen_location_create`

Inputs:

```yaml
name: required
parent_location_id: optional
location_type: required
storage_environment: required
```

### `kitchen_location_update`

Must require:

```yaml
location_id: required
expected_version: required
```

### `kitchen_location_move`

Moves a location and its children within the hierarchy.

Must prevent circular parent references.

### `kitchen_location_deactivate`

Must reject the operation when active inventory remains at the location unless a destination is supplied.

---

## 18.3 Ingredient Catalog Tools

### `kitchen_ingredient_search`

Inputs:

```yaml
query: required
languages: optional
categories: optional
limit: optional
```

Returns:

* canonical matches;
* aliases;
* confidence;
* possible ambiguity.

### `kitchen_ingredient_get`

Returns the canonical ingredient record.

### `kitchen_ingredient_create`

Used when an ingredient is not in the catalog.

### `kitchen_ingredient_add_alias`

Supports local names, user nicknames, and package names.

### `kitchen_ingredient_merge`

Administrative operation for duplicate ingredients.

Must preserve references and audit history.

---

## 18.4 Inventory Tools

### `kitchen_inventory_search`

Filters:

```yaml
query: optional
ingredient_id: optional
location_id: optional
category: optional
states: optional
expiring_before: optional
include_zero_quantity: false
include_candidate_locations: true
```

### `kitchen_inventory_get`

Returns one lot with:

* quantity;
* state;
* location;
* dates;
* confidence;
* transaction summary;
* reservations.

### `kitchen_inventory_add`

Inputs include:

```yaml
ingredient_id: required
quantity:
  value: required
  unit: required
  confidence: required
location_id: optional
unknown_location: optional
state: required
purchase_date: optional
printed_expiry_at: optional
estimated_expiry_at: optional
brand: optional
barcode: optional
idempotency_key: required
```

Exactly one of `location_id` or `unknown_location` should be supplied.

### `kitchen_inventory_adjust`

Used for corrections after weighing or visual checking.

Must record the previous and new quantity.

### `kitchen_inventory_consume`

Inputs:

```yaml
inventory_lot_id: required
quantity:
  value: required
  unit: required
reason: required
session_id: optional
idempotency_key: required
```

### `kitchen_inventory_move`

Moves an item between locations.

### `kitchen_inventory_split`

Example:

* split a 1 kg chicken packet into two 500 g freezer lots.

### `kitchen_inventory_merge`

Allowed only when compatible:

* same ingredient;
* equivalent state;
* compatible expiry;
* compatible storage;
* no conflicting lineage.

### `kitchen_inventory_discard`

Must require a reason.

Example reasons:

```text
spoiled
expired
damaged
contaminated
cooking_failure
user_choice
```

### `kitchen_inventory_mark_state`

Examples:

```text
opened
washed
chopped
frozen
thawing
marinating
spoiled
```

### `kitchen_inventory_find_location`

Searches confirmed and candidate locations.

### `kitchen_inventory_expiring`

Returns items ordered by expiry urgency and confidence.

### `kitchen_inventory_reconcile`

Compares reported physical inventory with system inventory.

Should support dry-run before applying corrections.

---

## 18.5 Equipment Tools

### `kitchen_equipment_list`

Supports filtering by capability and availability.

### `kitchen_equipment_get`

### `kitchen_equipment_add`

### `kitchen_equipment_update`

### `kitchen_equipment_set_availability`

Examples:

```text
available
in_use
dirty
broken
missing
```

### `kitchen_equipment_calibrate_container`

Records volume and optional tare weight.

---

## 18.6 Preference Tools

### `kitchen_preference_get_profile`

Returns preferences for one or more people.

### `kitchen_preference_record`

Must include:

```yaml
dimension: required
value: required
scope: required
source: required
confidence: required
```

### `kitchen_preference_record_meal_feedback`

Inputs may include:

```yaml
session_id: required
rating: optional
liked: optional
disliked: optional
too_spicy: optional
too_salty: optional
too_sweet: optional
texture_feedback: optional
would_make_again: optional
free_text_note: optional
```

This tool stores feedback. It should not automatically rewrite every preference.

### `kitchen_preference_suggest_updates`

Deterministically identifies repeated feedback patterns.

Returns suggestions requiring confirmation.

### `kitchen_preference_confirm_update`

Confirms or rejects a suggested preference change.

---

## 18.7 Restriction Tools

### `kitchen_restriction_list`

### `kitchen_restriction_add`

### `kitchen_restriction_update`

### `kitchen_restriction_deactivate`

Changes to allergies or severe medical restrictions should always be audited prominently.

---

## 18.8 Recipe Tools

### `kitchen_recipe_search`

Filters:

```yaml
query: optional
meal_type: optional
cuisine: optional
difficulty: optional
max_total_minutes: optional
equipment_available_only: optional
status: optional
```

### `kitchen_recipe_get`

Returns:

* recipe;
* active version;
* ingredients;
* steps;
* equipment;
* safety requirements;
* substitutions;
* nutrition, where available.

### `kitchen_recipe_create`

Creates a draft recipe.

### `kitchen_recipe_create_version`

Used for modifications to an existing recipe.

### `kitchen_recipe_validate`

Checks:

* missing quantities;
* incompatible units;
* missing steps;
* invalid dependencies;
* unavailable ingredient IDs;
* equipment inconsistencies;
* unresolved safety requirements;
* impossible yield values.

### `kitchen_recipe_publish_version`

Changes a validated draft version to verified or tested status.

### `kitchen_recipe_deprecate`

Preserves historical versions.

---

## 18.9 Recipe Matching Tools

### `kitchen_recipe_match`

Inputs:

```yaml
person_ids: optional
servings: required
max_total_minutes: optional
maximum_difficulty: optional
allowed_missing_required_items: 0
use_expiring_first: true
meal_type: optional
max_cleanup_level: optional
include_unverified_recipes: false
limit: 10
```

Each result should return:

```yaml
recipe_id: recipe_x
recipe_version_id: version_x
compatibility_score: 88
can_make_now: true
available_required_items: []
missing_required_items: []
missing_optional_items: []
proposed_substitutions: []
equipment_status: compatible
restriction_status: allowed
expiry_utilization_score: 20
estimated_inventory_cost: optional
reasons:
  - uses_leftover_rice
  - uses_expiring_carrot
```

### Suggested score components

```text
Required ingredient coverage: 35%
Restriction and safety compatibility: mandatory gate
Equipment compatibility: 15%
Time compatibility: 10%
Skill compatibility: 10%
Preference compatibility: 10%
Expiry utilization: 10%
Cleanup compatibility: 5%
Leftover utilization: 5%
```

Safety or restriction failure should exclude a recipe rather than merely reduce its score.

### `kitchen_recipe_check_availability`

Checks one recipe at a requested serving count.

### `kitchen_recipe_find_substitutions`

Returns substitution candidates with impact explanations.

### `kitchen_recipe_scale`

Performs deterministic scaling.

Must account for:

* non-linear ingredients;
* minimum practical amounts;
* indivisible units;
* pan or vessel capacity;
* serving yield;
* spice scaling rules.

Not every ingredient should be multiplied blindly.

---

## 18.10 Measurement Tools

### `kitchen_measurement_convert`

Inputs:

```yaml
ingredient_id: optional
from:
  value: required
  unit: required
to_unit: required
```

Ingredient ID is required when density or piece-weight conversion is needed.

### `kitchen_measurement_express_household`

Converts a metric amount into calibrated household containers.

Example:

```text
360 ml → 2 blue katoris
```

### `kitchen_measurement_estimate_piece_weight`

Returns an estimate and confidence, not a false exact value.

---

## 18.11 Cooking Session Tools

### `kitchen_session_plan`

Builds an executable plan without changing inventory.

Returns:

* scaled ingredients;
* selected lots;
* substitutions;
* equipment;
* step timeline;
* safety checks;
* estimated cleanup;
* inventory impact preview.

### `kitchen_session_start`

Must:

1. validate recipe;
2. validate restrictions;
3. check equipment;
4. reserve inventory;
5. create immutable session steps;
6. return the first ready steps.

### `kitchen_session_get`

Returns the complete session state.

### `kitchen_session_get_next_actions`

Returns steps whose dependencies are satisfied.

### `kitchen_session_start_step`

Marks one step active.

### `kitchen_session_complete_step`

May:

* record actual ingredient use;
* create inventory transactions;
* complete associated timers;
* unlock dependent steps.

### `kitchen_session_skip_step`

Must validate whether the step is optional.

### `kitchen_session_pause`

### `kitchen_session_resume`

### `kitchen_session_report_problem`

Structured problem types:

```text
ingredient_missing
too_wet
too_dry
burning
undercooked
overcooked
too_salty
too_spicy
wrong_texture
equipment_failure
spillage
safety_concern
other
```

Returns applicable recovery rules.

### `kitchen_session_apply_recovery`

Records which recovery action was selected.

### `kitchen_session_substitute_ingredient`

Validates a substitution and updates reservations.

### `kitchen_session_adjust_servings`

Allowed only before incompatible cooking steps have started.

### `kitchen_session_complete`

Must:

* finalize inventory deductions;
* release unused reservations;
* create prepared-food or leftover inventory;
* record actual duration;
* close timers;
* create history record.

### `kitchen_session_abandon`

Must request a disposition for reserved or partly used ingredients.

---

## 18.12 Timer Tools

### `kitchen_timer_create`

### `kitchen_timer_list_active`

### `kitchen_timer_get`

### `kitchen_timer_pause`

### `kitchen_timer_resume`

### `kitchen_timer_extend`

### `kitchen_timer_acknowledge`

### `kitchen_timer_cancel`

All timer mutations should use idempotency keys.

---

## 18.13 Shopping Tools

### `kitchen_shopping_list_create`

### `kitchen_shopping_list_get`

### `kitchen_shopping_item_add`

### `kitchen_shopping_item_update`

### `kitchen_shopping_generate_for_recipes`

Subtracts available usable stock from planned recipe requirements.

### `kitchen_shopping_generate_restock`

Uses manually configured minimum stock levels.

### `kitchen_shopping_mark_purchased`

### `kitchen_shopping_store_purchased_item`

Converts a purchased shopping item into one or more inventory lots.

No purchase or payment tool should be included in the base MCP.

---

## 18.14 Meal Planning Tools

### `kitchen_meal_plan_generate`

Inputs:

```yaml
start_date: required
end_date: required
person_ids: required
meal_types: required
max_cooking_minutes_per_meal: optional
shopping_allowed: optional
use_expiring_first: true
leftover_strategy: reuse
variety_requirement: optional
```

### `kitchen_meal_plan_validate`

Checks inventory, restrictions, equipment, and schedule feasibility.

### `kitchen_meal_plan_commit`

Optionally reserves or forecasts ingredient usage.

### `kitchen_meal_plan_get`

### `kitchen_meal_plan_update_entry`

### `kitchen_meal_plan_generate_shopping_list`

---

## 18.15 Expiry and Waste Tools

### `kitchen_expiry_list_prioritized`

Returns:

* printed expiry;
* estimated expiry;
* freshness confidence;
* current state;
* recommended priority.

### `kitchen_expiry_recipe_matches`

Finds recipes that use selected expiring items.

### `kitchen_waste_summary`

Reports:

* discarded quantity;
* reasons;
* frequently discarded ingredients;
* estimated preventable waste;
* time range.

---

## 18.16 Cleaning Tools

### `kitchen_cleaning_tasks_get`

### `kitchen_cleaning_task_complete`

### `kitchen_cleaning_mark_equipment_dirty`

### `kitchen_cleaning_mark_equipment_clean`

### `kitchen_cleaning_generate_from_session`

Cleaning state may affect equipment availability and cross-contamination validation.

---

## 18.17 History Tools

### `kitchen_history_sessions`

### `kitchen_history_get_session`

### `kitchen_history_recipe_performance`

Returns:

* attempts;
* successes;
* average rating;
* average actual duration;
* common substitutions;
* common problems;
* latest feedback.

### `kitchen_history_inventory_transactions`

### `kitchen_history_waste`

---

## 18.18 Safety Tools

### `kitchen_safety_validate_recipe`

Checks recipe against people, inventory states, and equipment.

### `kitchen_safety_validate_action`

Inputs:

```yaml
action_type: required
session_id: optional
ingredient_ids: optional
equipment_ids: optional
context: required
```

### `kitchen_safety_get_requirements`

Returns required safety checks for a recipe or step.

### `kitchen_safety_confirm_condition`

Example:

```yaml
condition: pressure_indicator_down
confirmed: true
source: user_confirmation
```

The safety engine should distinguish user-confirmed observations from sensor-confirmed observations.

---

# 19. MCP Resources

Resources should expose useful read-only snapshots.

Suggested URIs:

```text
kitchen://household/profile
kitchen://locations/tree
kitchen://inventory/current
kitchen://inventory/expiring
kitchen://equipment/available
kitchen://preferences/{person_id}
kitchen://restrictions/{person_id}
kitchen://recipes/{recipe_id}
kitchen://sessions/active
kitchen://shopping/active
kitchen://safety/rules
kitchen://system/schema-version
```

Resources are useful for context, but frequently changing or filtered data should still be obtained through tools.

Do not expose:

* raw database files;
* unrestricted local filesystem URIs;
* credentials;
* arbitrary SQL query resources;
* internal secrets;
* unrelated files.

---

# 20. Confirmation Workflow

Some tools should return a proposed operation rather than immediately applying it.

Example:

```json
{
  "ok": true,
  "status": "confirmation_required",
  "code": "ESTIMATED_QUANTITY_CONSUMPTION",
  "requires_confirmation": true,
  "confirmation": {
    "confirmation_token": "confirm_abc",
    "expires_at": "2026-07-17T09:10:00Z",
    "summary": {
      "operation": "consume_inventory",
      "item": "Milk",
      "quantity": "Approximately 100 ml"
    }
  }
}
```

A separate tool applies it:

```text
kitchen_confirmation_apply
```

Inputs:

```yaml
confirmation_token: required
idempotency_key: required
```

Use confirmation for:

* uncertain quantity changes;
* uncertain ingredient identity;
* inferred expiry;
* preference changes inferred from behaviour;
* destructive merges;
* discarding food;
* moving an item whose identity or location is uncertain.

---

# 21. Concurrency and Idempotency

Every state-changing tool should accept:

```text
idempotency_key
```

Duplicate calls with the same key and same payload should return the original result.

Duplicate keys with different payloads should be rejected.

Mutable entities should contain a version integer.

Update tools should accept:

```text
expected_version
```

If the version has changed:

```json
{
  "ok": false,
  "code": "CONCURRENT_MODIFICATION",
  "recoverable": true
}
```

This protects the system when multiple clients or repeated LLM calls attempt the same operation.

---

# 22. Audit Logging

Every write operation should capture:

```yaml
audit_id: audit_01
request_id: req_123
actor_type: mcp_client
actor_id: optional
tool_name: kitchen_inventory_consume
entity_type: inventory_lot
entity_id: lot_01
operation: update
before_data: redacted_snapshot
after_data: redacted_snapshot
created_at: timestamp
```

Security-sensitive records include:

* restriction changes;
* safety overrides;
* imports;
* exports;
* item deletion;
* recipe publication;
* database administration.

Audit history should not be editable through ordinary MCP tools.

---

# 23. Error Codes

Create a stable error-code catalogue.

Recommended categories:

## Validation

```text
INVALID_ARGUMENT
MISSING_REQUIRED_FIELD
INVALID_UNIT
INCOMPATIBLE_UNITS
INVALID_DATE
INVALID_STATE_TRANSITION
```

## Entity

```text
NOT_FOUND
ALREADY_EXISTS
INACTIVE_ENTITY
AMBIGUOUS_MATCH
```

## Inventory

```text
INSUFFICIENT_QUANTITY
INVENTORY_RESERVED
UNKNOWN_LOCATION
INVENTORY_STATE_CONFLICT
LOT_MERGE_INCOMPATIBLE
```

## Recipe

```text
RECIPE_INVALID
RECIPE_NOT_PUBLISHED
MISSING_REQUIRED_INGREDIENT
NO_VALID_SUBSTITUTION
EQUIPMENT_UNAVAILABLE
SERVING_SCALE_UNSUPPORTED
```

## Session

```text
SESSION_NOT_ACTIVE
STEP_DEPENDENCY_INCOMPLETE
STEP_ALREADY_COMPLETED
SESSION_STATE_CONFLICT
```

## Safety

```text
ALLERGEN_CONFLICT
FOOD_SAFETY_BLOCK
CROSS_CONTAMINATION_RISK
PRESSURE_SAFETY_BLOCK
EXPIRY_UNKNOWN
SAFETY_INFORMATION_MISSING
```

## System

```text
CONCURRENT_MODIFICATION
IDEMPOTENCY_CONFLICT
DATABASE_UNAVAILABLE
INTEGRATION_UNAVAILABLE
INTERNAL_ERROR
```

---

# 24. Recommended Database Tables

```text
households
people
ingredient_catalog
ingredient_aliases
ingredient_nutrition
locations
location_candidates
inventory_lots
inventory_state_events
inventory_transactions
inventory_reservations
equipment
equipment_capabilities
container_calibrations
preferences
preference_evidence
preference_suggestions
restrictions
cooking_skills
recipes
recipe_versions
recipe_ingredients
recipe_steps
recipe_step_dependencies
recipe_equipment
recipe_tags
substitution_rules
recovery_rules
meal_plans
meal_plan_entries
cooking_sessions
cooking_session_steps
cooking_session_events
session_ingredient_usage
timers
shopping_lists
shopping_items
cleaning_tasks
safety_rules
safety_confirmations
media_assets
confirmations
audit_log
idempotency_records
schema_migrations
```

---

# 25. Suggested Project Structure

Example using TypeScript:

```text
kitchen-mcp/
├── src/
│   ├── server/
│   │   ├── create-server.ts
│   │   ├── capabilities.ts
│   │   ├── transports/
│   │   │   ├── stdio.ts
│   │   │   └── http.ts
│   │   ├── tools/
│   │   └── resources/
│   ├── domain/
│   │   ├── inventory/
│   │   ├── locations/
│   │   ├── ingredients/
│   │   ├── equipment/
│   │   ├── recipes/
│   │   ├── substitutions/
│   │   ├── measurements/
│   │   ├── sessions/
│   │   ├── timers/
│   │   ├── shopping/
│   │   ├── preferences/
│   │   ├── safety/
│   │   └── history/
│   ├── application/
│   │   ├── commands/
│   │   ├── queries/
│   │   └── services/
│   ├── infrastructure/
│   │   ├── database/
│   │   ├── scheduler/
│   │   ├── media/
│   │   ├── integrations/
│   │   └── logging/
│   ├── shared/
│   │   ├── errors/
│   │   ├── schemas/
│   │   ├── units/
│   │   ├── ids/
│   │   └── time/
│   └── index.ts
├── migrations/
├── seed/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── contract/
│   ├── safety/
│   └── fixtures/
├── docs/
├── package.json
└── README.md
```

The official MCP project provides maintained SDKs for several languages, including TypeScript and Python. The TypeScript SDK supports server primitives and standard transports.

---

# 26. Technology Recommendation

## Recommended primary implementation

```text
Language: TypeScript
Runtime: Node.js
MCP SDK: Official TypeScript MCP SDK
Database: SQLite
Query layer: Kysely or Drizzle
Validation: Zod
Scheduler: Persistent database-backed timer worker
Testing: Vitest
Logging: Pino
IDs: UUIDv7 or ULID
Date storage: UTC ISO timestamps
```

Alternative:

```text
Language: Python
MCP SDK: Official Python MCP SDK
Database: SQLite
Validation: Pydantic
ORM/query layer: SQLAlchemy
Scheduler: APScheduler with persistent job store or a custom DB worker
Testing: Pytest
```

Pin the selected MCP SDK version rather than automatically tracking latest releases, because MCP specifications and SDK implementations continue to evolve. The official Python SDK, for example, distinguishes its stable v1 line from a newer major version under development.

---

# 27. Deployment Modes

## Version 1: Local stdio

```text
MCP client
   ↓ starts process
Kitchen MCP server
   ↓
Local SQLite database
```

Advantages:

* smallest attack surface;
* no listening network port;
* easy integration;
* suitable for one local agent.

## Version 2: Local service over HTTP

```text
MCP client
   ↓ localhost Streamable HTTP
Kitchen MCP service
```

Use:

* loopback binding only;
* authentication token;
* request limits;
* explicit allowed origins where relevant.

## Version 3: Remote private service

Requires:

* TLS;
* MCP-compatible HTTP authorization;
* user and household isolation;
* token rotation;
* database encryption strategy;
* backup policy;
* strict audit logging;
* rate limiting;
* network firewalling.

MCP defines an authorization framework for HTTP-based transports; it should be used rather than inventing an insecure query-parameter token system.

---

# 28. Security Requirements

Kitchen MCP must not expose:

* shell execution;
* arbitrary file reads;
* arbitrary file writes;
* arbitrary HTTP requests;
* arbitrary SQL;
* package installation;
* browser automation;
* environment variables;
* unrelated user data.

External integrations should be implemented as narrow domain-specific adapters.

For example:

```text
Good:
kitchen_barcode_lookup(barcode)

Bad:
http_request(url, method, headers, body)
```

```text
Good:
kitchen_media_attach_inventory_photo(...)

Bad:
write_file(path, contents)
```

For remote deployment:

* run under a dedicated operating-system account;
* use a dedicated database;
* restrict filesystem permissions;
* store secrets outside the database;
* redact secrets from logs;
* disable development endpoints;
* apply request-size limits;
* validate all imported data;
* create automatic backups;
* test restore procedures.

---

# 29. Privacy Requirements

Kitchen data may reveal:

* eating patterns;
* health-related restrictions;
* household composition;
* shopping habits;
* daily routines.

Therefore:

1. Local-first storage should be the default.
2. External integrations should be opt-in.
3. Export must support redaction.
4. Logs must not contain unnecessary health data.
5. Images must not be externally uploaded without explicit configuration.
6. Telemetry should be disabled by default.
7. Database backups must be configurable.
8. Deleting a person should support removing or anonymizing their sensitive preference and restriction data.

---

# 30. Testing Strategy

## 30.1 Unit Tests

Test each domain rule independently.

Examples:

* unit conversion;
* recipe scaling;
* expiry prioritization;
* substitution validity;
* restriction matching;
* inventory deductions;
* nested locations;
* recipe score calculation.

## 30.2 Database Integration Tests

Test:

* transactions;
* rollback;
* migrations;
* concurrency;
* reservation conflicts;
* idempotency;
* version conflicts.

## 30.3 MCP Contract Tests

For every tool:

* valid request;
* invalid request;
* missing field;
* unknown identifier;
* success response schema;
* failure response schema;
* deterministic tool description;
* stable ordering where applicable.

The current MCP specification recommends deterministic tool listing to improve client caching behaviour.

## 30.4 Safety Tests

Safety tests are mandatory and should include:

* allergy conflict;
* severe intolerance;
* raw-meat contamination;
* spoiled ingredient;
* unknown room-temperature duration;
* unsafe pressure-cooker opening;
* dirty equipment;
* invalid reheating state;
* unsafe substitution;
* missing safety information.

## 30.5 Scenario Tests

### Scenario: Basic cooking

1. Add eggs and onion.
2. Add pan.
3. Match recipes.
4. Start omelette session.
5. Reserve ingredients.
6. Complete steps.
7. Consume inventory.
8. Create history.
9. Record feedback.

### Scenario: Insufficient inventory

1. Recipe needs four eggs.
2. Inventory contains two.
3. Recipe availability returns missing quantity.
4. Scaling to one serving succeeds.
5. Inventory remains unchanged during preview.

### Scenario: Duplicate tool call

1. Consume 100 ml milk with idempotency key.
2. Repeat exact request.
3. Quantity is deducted only once.

### Scenario: Concurrent sessions

1. Session A reserves three eggs.
2. Session B requests the same eggs.
3. Session B receives an inventory-reserved result.

### Scenario: Safety block

1. Person has peanut allergy.
2. Recipe contains peanut.
3. Matching excludes recipe.
4. Starting the session is blocked even when called directly.

---

# 31. Observability

Collect:

* tool call counts;
* tool duration;
* validation failures;
* database failures;
* active timers;
* overdue timers;
* safety blocks;
* integration failures;
* migration version;
* scheduler heartbeat.

Do not record full sensitive payloads by default.

Use correlation IDs:

```text
request_id
session_id
tool_call_id
```

---

# 32. Versioning Strategy

Version:

1. MCP server package;
2. database schema;
3. tool contracts;
4. recipe schema;
5. export format;
6. safety rules.

Example:

```yaml
server_version: 0.1.0
database_schema_version: 4
tool_contract_version: 1
export_format_version: 1
```

Breaking tool changes should create a new tool version or a server major version.

Avoid silently changing argument meaning.

---

# 33. Implementation Phases

## Phase 0 — Foundation

Build:

* project structure;
* MCP server startup;
* SQLite database;
* migration framework;
* standard response envelope;
* error catalogue;
* idempotency infrastructure;
* audit infrastructure;
* health tool.

Deliverable:

```text
A working MCP server with one test tool and persistent storage.
```

---

## Phase 1 — Kitchen Map and Inventory

Build:

* ingredient catalog;
* ingredient aliases;
* nested locations;
* inventory lots;
* quantity confidence;
* inventory transactions;
* search;
* add;
* adjust;
* consume;
* move;
* discard;
* expiry listing.

This phase is the minimum useful kitchen data layer.

---

## Phase 2 — Equipment and Measurements

Build:

* equipment records;
* capabilities;
* availability;
* household container calibration;
* measurement conversion;
* ingredient density and piece-weight support.

---

## Phase 3 — Recipes

Build:

* recipes;
* recipe versions;
* structured ingredients;
* structured steps;
* dependencies;
* equipment requirements;
* recipe validation;
* recipe import and creation.

---

## Phase 4 — Recipe Matching

Build:

* inventory availability checks;
* restriction gates;
* equipment checks;
* time and difficulty filters;
* preference scoring;
* expiry utilization;
* substitution rules;
* recipe scaling.

---

## Phase 5 — Cooking Sessions

Build:

* session planning;
* ingredient reservations;
* persistent session steps;
* progress tracking;
* ingredient usage;
* session events;
* completion;
* leftover generation;
* recovery rules.

---

## Phase 6 — Timers

Build:

* persistent timer records;
* background scheduler;
* multiple concurrent timers;
* pause, resume, extend, acknowledge;
* timer recovery after process restart.

---

## Phase 7 — Preferences and History

Build:

* structured preferences;
* meal feedback;
* preference evidence;
* suggested preference updates;
* cooking history;
* recipe performance statistics.

---

## Phase 8 — Shopping and Meal Planning

Build:

* shopping lists;
* stock subtraction;
* recipe-based shopping generation;
* restock thresholds;
* meal plans;
* expiry-aware planning;
* leftover reuse.

---

## Phase 9 — Safety Hardening

Basic safety validation should exist earlier. This phase expands and hardens it:

* formal safety-rule engine;
* cross-contamination state;
* severe allergen enforcement;
* equipment safety profiles;
* safety confirmation records;
* adversarial and bypass testing.

---

## Phase 10 — Optional Integrations

Only after the core system is stable:

* barcode lookup;
* package-label extraction;
* nutrition database;
* image-assisted ingredient identification;
* smart scale;
* temperature sensor;
* refrigerator sensor;
* notification channels;
* grocery platform integration.

Each integration must remain behind a narrow kitchen-specific interface.

---

# 34. Minimum Viable Product

The first release should expose only these tools:

```text
kitchen_system_health

kitchen_location_list
kitchen_location_create

kitchen_ingredient_search
kitchen_ingredient_create
kitchen_ingredient_add_alias

kitchen_inventory_search
kitchen_inventory_get
kitchen_inventory_add
kitchen_inventory_adjust
kitchen_inventory_consume
kitchen_inventory_move
kitchen_inventory_expiring

kitchen_equipment_list
kitchen_equipment_add

kitchen_recipe_search
kitchen_recipe_get
kitchen_recipe_create
kitchen_recipe_validate
kitchen_recipe_match
kitchen_recipe_scale

kitchen_measurement_convert

kitchen_session_plan
kitchen_session_start
kitchen_session_get
kitchen_session_get_next_actions
kitchen_session_start_step
kitchen_session_complete_step
kitchen_session_report_problem
kitchen_session_complete
kitchen_session_abandon

kitchen_timer_create
kitchen_timer_list_active
kitchen_timer_pause
kitchen_timer_resume
kitchen_timer_cancel

kitchen_preference_get_profile
kitchen_preference_record_meal_feedback

kitchen_safety_validate_recipe
kitchen_safety_validate_action
```

Do not expose hundreds of tools in the first release. Add tools only when their domain behaviour is implemented and tested.

---

# 35. Initial Seed Data

The project should include seed definitions for:

## Units

```text
g
kg
ml
l
tsp
tbsp
cup
piece
packet
pinch
handful
serving
```

## Storage environments

```text
ambient
cool_dry
refrigerated
frozen
heated
temporary
unknown
```

## Common equipment types

```text
stove
pan
pot
kadai
pressure_cooker
knife
chopping_board
mixer
spoon
spatula
bowl
plate
storage_container
```

## Basic ingredient categories

```text
vegetable
fruit
grain
pulse
flour
spice
herb
oil
dairy
egg
meat
seafood
condiment
sauce
beverage
prepared_food
leftover
other
```

## Common Indian ingredient aliases

Seed a small verified set, then allow the household to add its own names.

Do not attempt to create a massive universal ingredient database during the first release.

---

# 36. Acceptance Criteria for Version 1

Version 1 is considered successful when the following workflow works without manual database editing:

1. Create the kitchen location hierarchy.
2. Add ingredients using canonical or user-known names.
3. Record exact or estimated quantities.
4. Record where items are stored.
5. Add available equipment.
6. Store at least ten structured recipes.
7. Ask the MCP which recipes can be cooked now.
8. Receive accurate missing-item and substitution information.
9. Scale a recipe for a requested serving count.
10. Start a persistent cooking session.
11. Reserve ingredients.
12. Track individual steps.
13. Run persistent named timers.
14. Complete the session.
15. Deduct used ingredients exactly once.
16. Create leftover inventory.
17. Record meal feedback.
18. Find expiring items.
19. Generate a shopping list.
20. Reject an unsafe recipe or action.

---

# 37. Non-Goals

Kitchen MCP must not attempt to become:

* a general personal assistant;
* a filesystem manager;
* a browser agent;
* a general automation server;
* an unrestricted API proxy;
* an autonomous purchasing system;
* a medical diagnosis system;
* an LLM memory database for unrelated topics;
* an agent personality layer;
* a universal recipe-generation model.

---

# 38. Final Architecture Rule

For every proposed feature, ask:

```text
Is this kitchen data, a kitchen calculation, a kitchen state transition,
a kitchen safety rule, or a tightly controlled kitchen integration?
```

If the answer is no, it does not belong in Kitchen MCP.

The desired separation is:

```text
External LLM
    Understands and communicates

Kitchen MCP tools
    Perform controlled kitchen operations

Kitchen domain services
    Apply deterministic business rules

Kitchen database
    Preserves authoritative state

Safety engine
    Blocks unsafe transitions
```

Kitchen MCP should remain narrow, structured, auditable, deterministic, and independent of any particular LLM or agent implementation.
