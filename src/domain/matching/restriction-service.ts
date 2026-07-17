import type Database from 'better-sqlite3';
import { generateId } from '../../shared/ids.js';
import { writeAuditLog } from '../../infrastructure/audit.js';
import type { PersonRestriction, RestrictionType, RestrictionSeverity } from '../matching/types.js';

interface RestrictionRow {
  restriction_id: string;
  person_id: string;
  restriction_type: string;
  ingredient_id: string | null;
  ingredient_category: string | null;
  severity: string;
  cross_contamination_sensitive: number;
  source: string;
  active: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRestriction(row: RestrictionRow): PersonRestriction {
  return {
    ...row,
    restriction_type: row.restriction_type as RestrictionType,
    severity: row.severity as RestrictionSeverity,
    cross_contamination_sensitive: row.cross_contamination_sensitive === 1,
    active: row.active === 1,
  };
}

export class RestrictionService {
  constructor(private db: Database.Database) {}

  list(personId: string, activeOnly = true): PersonRestriction[] {
    const where = activeOnly ? 'WHERE person_id = ? AND active = 1' : 'WHERE person_id = ?';
    const rows = this.db
      .prepare(`SELECT * FROM person_restrictions ${where} ORDER BY severity DESC, restriction_type`)
      .all(personId) as RestrictionRow[];
    return rows.map(rowToRestriction);
  }

  get(restrictionId: string): PersonRestriction | undefined {
    const row = this.db
      .prepare('SELECT * FROM person_restrictions WHERE restriction_id = ?')
      .get(restrictionId) as RestrictionRow | undefined;
    return row ? rowToRestriction(row) : undefined;
  }

  add(input: {
    person_id: string;
    restriction_type: RestrictionType;
    ingredient_id?: string;
    ingredient_category?: string;
    severity?: RestrictionSeverity;
    cross_contamination_sensitive?: boolean;
    source?: string;
    notes?: string;
  }): PersonRestriction {
    const id = generateId('restriction');
    this.db
      .prepare(
        `INSERT INTO person_restrictions (restriction_id, person_id, restriction_type, ingredient_id, ingredient_category, severity, cross_contamination_sensitive, source, active, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))`,
      )
      .run(
        id,
        input.person_id,
        input.restriction_type,
        input.ingredient_id ?? null,
        input.ingredient_category ?? null,
        input.severity ?? 'moderate',
        input.cross_contamination_sensitive ? 1 : 0,
        input.source ?? 'user_entered',
        input.notes ?? null,
      );

    writeAuditLog(this.db, {
      tool_name: 'kitchen_restriction_add',
      entity_type: 'restriction',
      entity_id: id,
      operation: 'create',
      after_data: { restriction_type: input.restriction_type, ingredient_id: input.ingredient_id },
    });

    return this.get(id)!;
  }

  deactivate(restrictionId: string): PersonRestriction {
    const restriction = this.get(restrictionId);
    if (!restriction) throw new Error('Restriction not found');

    this.db
      .prepare("UPDATE person_restrictions SET active = 0, updated_at = datetime('now') WHERE restriction_id = ?")
      .run(restrictionId);

    writeAuditLog(this.db, {
      tool_name: 'kitchen_restriction_deactivate',
      entity_type: 'restriction',
      entity_id: restrictionId,
      operation: 'deactivate',
    });

    return this.get(restrictionId)!;
  }

  getBlockedIngredientIds(personIds: string[]): Set<string> {
    if (personIds.length === 0) return new Set();

    const placeholders = personIds.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT DISTINCT ingredient_id FROM person_restrictions
         WHERE person_id IN (${placeholders})
         AND active = 1 AND ingredient_id IS NOT NULL
         AND restriction_type IN ('allergy', 'intolerance', 'medical', 'religious', 'ethical')`,
      )
      .all(...personIds) as { ingredient_id: string }[];

    return new Set(rows.map((r) => r.ingredient_id));
  }

  getBlockedCategories(personIds: string[]): Set<string> {
    if (personIds.length === 0) return new Set();

    const placeholders = personIds.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT DISTINCT ingredient_category FROM person_restrictions
         WHERE person_id IN (${placeholders})
         AND active = 1 AND ingredient_category IS NOT NULL
         AND restriction_type IN ('allergy', 'intolerance', 'medical', 'religious', 'ethical')`,
      )
      .all(...personIds) as { ingredient_category: string }[];

    return new Set(rows.map((r) => r.ingredient_category));
  }

  getSevereAllergenIngredientIds(personIds: string[]): Set<string> {
    if (personIds.length === 0) return new Set();

    const placeholders = personIds.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT DISTINCT ingredient_id FROM person_restrictions
         WHERE person_id IN (${placeholders})
         AND active = 1 AND ingredient_id IS NOT NULL
         AND restriction_type = 'allergy'
         AND severity IN ('severe', 'life_threatening')`,
      )
      .all(...personIds) as { ingredient_id: string }[];

    return new Set(rows.map((r) => r.ingredient_id));
  }
}
