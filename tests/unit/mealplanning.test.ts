import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, seedHousehold, seedIngredient, seedRecipe } from '../fixtures/db.js';
import { MealPlanService } from '../../src/domain/mealplanning/service.js';

let db: Database.Database;
let service: MealPlanService;

beforeEach(() => {
  db = createTestDb();
  seedHousehold(db);
  seedIngredient(db, 'ing_tomato', 'Tomato', 'vegetable');
  seedIngredient(db, 'ing_onion', 'Onion', 'vegetable');
  seedIngredient(db, 'ing_egg', 'Egg', 'egg');
  service = new MealPlanService(db);
});

describe('MealPlanService', () => {
  describe('create', () => {
    it('creates a meal plan with draft status', () => {
      const plan = service.create({
        household_id: 'hh_default',
        name: 'July week 3',
        start_date: '2026-07-20',
        end_date: '2026-07-26',
      });
      expect(plan.meal_plan_id).toMatch(/^mp_/);
      expect(plan.name).toBe('July week 3');
      expect(plan.status).toBe('draft');
      expect(plan.start_date).toBe('2026-07-20');
      expect(plan.end_date).toBe('2026-07-26');
    });

    it('writes an audit log entry', () => {
      const plan = service.create({
        household_id: 'hh_default',
        name: 'Test plan',
        start_date: '2026-07-20',
        end_date: '2026-07-26',
      });
      const audit = db.prepare('SELECT * FROM audit_log WHERE entity_id = ?').get(plan.meal_plan_id) as { operation: string } | undefined;
      expect(audit).toBeDefined();
      expect(audit!.operation).toBe('create');
    });
  });

  describe('get / list', () => {
    it('retrieves a plan by id', () => {
      const plan = service.create({
        household_id: 'hh_default',
        name: 'Test',
        start_date: '2026-07-20',
        end_date: '2026-07-26',
      });
      const found = service.get(plan.meal_plan_id);
      expect(found).toBeDefined();
      expect(found!.name).toBe('Test');
    });

    it('returns undefined for nonexistent plan', () => {
      expect(service.get('mp_nonexistent')).toBeUndefined();
    });

    it('lists plans for a household', () => {
      service.create({ household_id: 'hh_default', name: 'Plan 1', start_date: '2026-07-20', end_date: '2026-07-22' });
      service.create({ household_id: 'hh_default', name: 'Plan 2', start_date: '2026-07-23', end_date: '2026-07-26' });
      const plans = service.list('hh_default');
      expect(plans.length).toBe(2);
    });

    it('filters by status', () => {
      const p1 = service.create({ household_id: 'hh_default', name: 'Draft', start_date: '2026-07-20', end_date: '2026-07-22' });
      service.create({ household_id: 'hh_default', name: 'Another', start_date: '2026-07-23', end_date: '2026-07-26' });

      const drafts = service.list('hh_default', { status: 'draft' });
      expect(drafts.length).toBe(2);
    });
  });

  describe('addEntry', () => {
    it('adds a recipe entry to a draft plan', () => {
      seedRecipe(db, 'recipe_omelette', 'Masala Omelette', {
        meal_types: ['breakfast'],
        ingredients: [{ ingredient_id: 'ing_egg', quantity_value: 2, quantity_unit: 'piece' }],
      });

      const plan = service.create({
        household_id: 'hh_default',
        name: 'Test',
        start_date: '2026-07-20',
        end_date: '2026-07-26',
      });

      const entry = service.addEntry({
        meal_plan_id: plan.meal_plan_id,
        date: '2026-07-21',
        meal_type: 'breakfast',
        recipe_id: 'recipe_omelette',
        servings: 2,
      });

      expect(entry.meal_plan_entry_id).toMatch(/^mpi_/);
      expect(entry.recipe_id).toBe('recipe_omelette');
      expect(entry.servings).toBe(2);
      expect(entry.meal_type).toBe('breakfast');
    });

    it('rejects entry with date outside plan range', () => {
      seedRecipe(db, 'recipe_omelette', 'Omelette', { meal_types: ['breakfast'] });

      const plan = service.create({
        household_id: 'hh_default',
        name: 'Test',
        start_date: '2026-07-20',
        end_date: '2026-07-22',
      });

      expect(() =>
        service.addEntry({
          meal_plan_id: plan.meal_plan_id,
          date: '2026-07-25',
          meal_type: 'breakfast',
          recipe_id: 'recipe_omelette',
          servings: 1,
        }),
      ).toThrow();
    });

    it('rejects entry for nonexistent recipe', () => {
      const plan = service.create({
        household_id: 'hh_default',
        name: 'Test',
        start_date: '2026-07-20',
        end_date: '2026-07-26',
      });

      expect(() =>
        service.addEntry({
          meal_plan_id: plan.meal_plan_id,
          date: '2026-07-21',
          meal_type: 'breakfast',
          recipe_id: 'recipe_nonexistent',
          servings: 1,
        }),
      ).toThrow();
    });

    it('rejects entry for recipe with no published version', () => {
      seedRecipe(db, 'recipe_draft', 'Draft Recipe', {
        meal_types: ['lunch'],
        status: 'draft',
      });

      db.prepare('UPDATE recipes SET active_version_id = NULL WHERE recipe_id = ?').run('recipe_draft');

      const plan = service.create({
        household_id: 'hh_default',
        name: 'Test',
        start_date: '2026-07-20',
        end_date: '2026-07-26',
      });

      expect(() =>
        service.addEntry({
          meal_plan_id: plan.meal_plan_id,
          date: '2026-07-21',
          meal_type: 'lunch',
          recipe_id: 'recipe_draft',
          servings: 1,
        }),
      ).toThrow();
    });

    it('rejects adding to a completed plan', () => {
      seedRecipe(db, 'recipe_omelette', 'Omelette', { meal_types: ['breakfast'] });

      const plan = service.create({
        household_id: 'hh_default',
        name: 'Test',
        start_date: '2026-07-20',
        end_date: '2026-07-26',
      });
      service.commit(plan.meal_plan_id);
      service.complete(plan.meal_plan_id);

      expect(() =>
        service.addEntry({
          meal_plan_id: plan.meal_plan_id,
          date: '2026-07-21',
          meal_type: 'breakfast',
          recipe_id: 'recipe_omelette',
          servings: 1,
        }),
      ).toThrow();
    });
  });

  describe('getEntries', () => {
    it('returns entries sorted by date and meal type', () => {
      seedRecipe(db, 'recipe_omelette', 'Omelette', { meal_types: ['breakfast'] });
      seedRecipe(db, 'recipe_dal', 'Dal', { meal_types: ['lunch', 'dinner'] });

      const plan = service.create({
        household_id: 'hh_default',
        name: 'Test',
        start_date: '2026-07-20',
        end_date: '2026-07-26',
      });

      service.addEntry({ meal_plan_id: plan.meal_plan_id, date: '2026-07-21', meal_type: 'dinner', recipe_id: 'recipe_dal', servings: 2 });
      service.addEntry({ meal_plan_id: plan.meal_plan_id, date: '2026-07-21', meal_type: 'breakfast', recipe_id: 'recipe_omelette', servings: 1 });
      service.addEntry({ meal_plan_id: plan.meal_plan_id, date: '2026-07-20', meal_type: 'lunch', recipe_id: 'recipe_dal', servings: 2 });

      const entries = service.getEntries(plan.meal_plan_id);
      expect(entries.length).toBe(3);
      expect(entries[0].date).toBe('2026-07-20');
      expect(entries[1].date).toBe('2026-07-21');
      expect(entries[1].meal_type).toBe('breakfast');
      expect(entries[2].meal_type).toBe('dinner');
    });
  });

  describe('updateEntry', () => {
    it('updates entry fields', () => {
      seedRecipe(db, 'recipe_omelette', 'Omelette', { meal_types: ['breakfast'] });
      seedRecipe(db, 'recipe_pasta', 'Pasta', { meal_types: ['lunch'] });

      const plan = service.create({
        household_id: 'hh_default',
        name: 'Test',
        start_date: '2026-07-20',
        end_date: '2026-07-26',
      });

      const entry = service.addEntry({
        meal_plan_id: plan.meal_plan_id,
        date: '2026-07-21',
        meal_type: 'breakfast',
        recipe_id: 'recipe_omelette',
        servings: 1,
      });

      const updated = service.updateEntry({
        meal_plan_entry_id: entry.meal_plan_entry_id,
        servings: 3,
        recipe_id: 'recipe_pasta',
        meal_type: 'lunch',
      });

      expect(updated.servings).toBe(3);
      expect(updated.recipe_id).toBe('recipe_pasta');
      expect(updated.meal_type).toBe('lunch');
    });

    it('rejects updating an entry in a completed plan', () => {
      seedRecipe(db, 'recipe_omelette', 'Omelette', { meal_types: ['breakfast'] });

      const plan = service.create({
        household_id: 'hh_default',
        name: 'Test',
        start_date: '2026-07-20',
        end_date: '2026-07-26',
      });

      const entry = service.addEntry({
        meal_plan_id: plan.meal_plan_id,
        date: '2026-07-21',
        meal_type: 'breakfast',
        recipe_id: 'recipe_omelette',
        servings: 1,
      });

      service.commit(plan.meal_plan_id);
      service.complete(plan.meal_plan_id);

      expect(() =>
        service.updateEntry({ meal_plan_entry_id: entry.meal_plan_entry_id, servings: 2 }),
      ).toThrow();
    });
  });

  describe('removeEntry', () => {
    it('removes an entry from a plan', () => {
      seedRecipe(db, 'recipe_omelette', 'Omelette', { meal_types: ['breakfast'] });

      const plan = service.create({
        household_id: 'hh_default',
        name: 'Test',
        start_date: '2026-07-20',
        end_date: '2026-07-26',
      });

      const entry = service.addEntry({
        meal_plan_id: plan.meal_plan_id,
        date: '2026-07-21',
        meal_type: 'breakfast',
        recipe_id: 'recipe_omelette',
        servings: 1,
      });

      service.removeEntry(entry.meal_plan_entry_id);
      const entries = service.getEntries(plan.meal_plan_id);
      expect(entries.length).toBe(0);
    });
  });

  describe('validate', () => {
    it('validates a plan with valid entries', () => {
      seedRecipe(db, 'recipe_omelette', 'Omelette', { meal_types: ['breakfast'] });

      const plan = service.create({
        household_id: 'hh_default',
        name: 'Test',
        start_date: '2026-07-20',
        end_date: '2026-07-26',
      });

      service.addEntry({
        meal_plan_id: plan.meal_plan_id,
        date: '2026-07-21',
        meal_type: 'breakfast',
        recipe_id: 'recipe_omelette',
        servings: 2,
      });

      const result = service.validate(plan.meal_plan_id);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('warns about empty plans', () => {
      const plan = service.create({
        household_id: 'hh_default',
        name: 'Test',
        start_date: '2026-07-20',
        end_date: '2026-07-26',
      });

      const result = service.validate(plan.meal_plan_id);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Meal plan has no entries');
    });

    it('reports errors for missing recipes', () => {
      const plan = service.create({
        household_id: 'hh_default',
        name: 'Test',
        start_date: '2026-07-20',
        end_date: '2026-07-26',
      });

      db.pragma('foreign_keys = OFF');
      db.prepare(
        `INSERT INTO meal_plan_entries (meal_plan_entry_id, meal_plan_id, date, meal_type, recipe_id, recipe_version_id, servings, priority_reasons, notes, created_at, updated_at)
         VALUES ('mpi_fake', ?, '2026-07-21', 'breakfast', 'recipe_nonexistent', 'rv_fake', 1, '[]', NULL, datetime('now'), datetime('now'))`,
      ).run(plan.meal_plan_id);
      db.pragma('foreign_keys = ON');

      const result = service.validate(plan.meal_plan_id);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('not found'))).toBe(true);
    });

    it('reports zero servings as error', () => {
      seedRecipe(db, 'recipe_omelette', 'Omelette', { meal_types: ['breakfast'] });

      const plan = service.create({
        household_id: 'hh_default',
        name: 'Test',
        start_date: '2026-07-20',
        end_date: '2026-07-26',
      });

      db.prepare(
        `INSERT INTO meal_plan_entries (meal_plan_entry_id, meal_plan_id, date, meal_type, recipe_id, recipe_version_id, servings, priority_reasons, notes, created_at, updated_at)
         VALUES ('mpi_zero', ?, '2026-07-21', 'breakfast', 'recipe_omelette', 'rv_omelette_v1', 0, '[]', NULL, datetime('now'), datetime('now'))`,
      ).run(plan.meal_plan_id);

      const result = service.validate(plan.meal_plan_id);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('servings must be positive'))).toBe(true);
    });
  });

  describe('commit', () => {
    it('commits a draft plan to active', () => {
      seedRecipe(db, 'recipe_omelette', 'Omelette', { meal_types: ['breakfast'] });

      const plan = service.create({
        household_id: 'hh_default',
        name: 'Test',
        start_date: '2026-07-20',
        end_date: '2026-07-26',
      });

      service.addEntry({
        meal_plan_id: plan.meal_plan_id,
        date: '2026-07-21',
        meal_type: 'breakfast',
        recipe_id: 'recipe_omelette',
        servings: 2,
      });

      const committed = service.commit(plan.meal_plan_id);
      expect(committed.status).toBe('active');
    });

    it('rejects committing an invalid plan', () => {
      const plan = service.create({
        household_id: 'hh_default',
        name: 'Empty',
        start_date: '2026-07-20',
        end_date: '2026-07-26',
      });

      db.pragma('foreign_keys = OFF');
      db.prepare(
        `INSERT INTO meal_plan_entries (meal_plan_entry_id, meal_plan_id, date, meal_type, recipe_id, recipe_version_id, servings, priority_reasons, notes, created_at, updated_at)
         VALUES ('mpi_bad', ?, '2026-07-21', 'breakfast', 'recipe_nonexistent', 'rv_fake', 1, '[]', NULL, datetime('now'), datetime('now'))`,
      ).run(plan.meal_plan_id);
      db.pragma('foreign_keys = ON');

      expect(() => service.commit(plan.meal_plan_id)).toThrow();
    });
  });

  describe('complete', () => {
    it('marks a plan as completed', () => {
      const plan = service.create({
        household_id: 'hh_default',
        name: 'Test',
        start_date: '2026-07-20',
        end_date: '2026-07-26',
      });

      const completed = service.complete(plan.meal_plan_id);
      expect(completed.status).toBe('completed');
    });
  });

  describe('generate', () => {
    it('auto-generates a meal plan with recipe entries', () => {
      seedRecipe(db, 'recipe_omelette', 'Masala Omelette', {
        meal_types: ['breakfast'],
        ingredients: [{ ingredient_id: 'ing_egg', quantity_value: 2, quantity_unit: 'piece' }],
        prep_time_minutes: 5,
        cook_time_minutes: 5,
      });

      seedRecipe(db, 'recipe_dal', 'Dal Fry', {
        meal_types: ['lunch'],
        ingredients: [
          { ingredient_id: 'ing_tomato', quantity_value: 2, quantity_unit: 'piece' },
          { ingredient_id: 'ing_onion', quantity_value: 1, quantity_unit: 'piece' },
        ],
        prep_time_minutes: 10,
        cook_time_minutes: 20,
      });

      const plan = service.generate({
        household_id: 'hh_default',
        start_date: '2026-07-20',
        end_date: '2026-07-21',
        meal_types: ['breakfast', 'lunch'],
        servings: 2,
      });

      expect(plan.status).toBe('draft');
      const entries = service.getEntries(plan.meal_plan_id);
      expect(entries.length).toBeGreaterThanOrEqual(2);
      expect(entries.every((e) => e.servings === 2)).toBe(true);
    });

    it('respects max_cooking_minutes_per_meal filter', () => {
      seedRecipe(db, 'recipe_omelette', 'Quick Omelette', {
        meal_types: ['breakfast'],
        prep_time_minutes: 3,
        cook_time_minutes: 5,
      });

      seedRecipe(db, 'recipe_biryani', 'Biryani', {
        meal_types: ['breakfast'],
        prep_time_minutes: 30,
        cook_time_minutes: 45,
      });

      const plan = service.generate({
        household_id: 'hh_default',
        start_date: '2026-07-20',
        end_date: '2026-07-20',
        meal_types: ['breakfast'],
        servings: 2,
        max_cooking_minutes_per_meal: 10,
      });

      const entries = service.getEntries(plan.meal_plan_id);
      expect(entries.length).toBe(1);
      expect(entries[0].recipe_id).toBe('recipe_omelette');
    });

    it('generates empty plan when no recipes match', () => {
      const plan = service.generate({
        household_id: 'hh_default',
        start_date: '2026-07-20',
        end_date: '2026-07-20',
        meal_types: ['snack'],
        servings: 1,
      });

      const entries = service.getEntries(plan.meal_plan_id);
      expect(entries.length).toBe(0);
    });
  });
});
