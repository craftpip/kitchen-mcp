import type Database from 'better-sqlite3';
import { generateId } from '../../shared/ids.js';
import { writeAuditLog } from '../../infrastructure/audit.js';
import type { PersonPreference, PreferenceDimension, PreferenceScope, PreferenceSource } from './types.js';

interface PreferenceRow {
  preference_id: string;
  person_id: string;
  dimension: string;
  value_numeric: number;
  scale_min: number;
  scale_max: number;
  scope: string;
  scope_value: string | null;
  confidence: string;
  source: string;
  created_at: string;
  updated_at: string;
}

function rowToPreference(row: PreferenceRow): PersonPreference {
  return {
    ...row,
    dimension: row.dimension as PreferenceDimension,
    scope: row.scope as PreferenceScope,
    source: row.source as PreferenceSource,
  };
}

export class PreferenceService {
  constructor(private db: Database.Database) {}

  list(personId: string): PersonPreference[] {
    const rows = this.db
      .prepare('SELECT * FROM person_preferences WHERE person_id = ? ORDER BY dimension, scope')
      .all(personId) as PreferenceRow[];
    return rows.map(rowToPreference);
  }

  get(personId: string, dimension: string, scope = 'global', scopeValue: string | null = null): PersonPreference | undefined {
    const row = this.db
      .prepare('SELECT * FROM person_preferences WHERE person_id = ? AND dimension = ? AND scope = ? AND scope_value IS ?')
      .get(personId, dimension, scope, scopeValue) as PreferenceRow | undefined;
    return row ? rowToPreference(row) : undefined;
  }

  set(input: {
    person_id: string;
    dimension: PreferenceDimension;
    value: number;
    scale_min?: number;
    scale_max?: number;
    scope?: PreferenceScope;
    scope_value?: string;
    confidence?: string;
    source?: PreferenceSource;
  }): PersonPreference {
    const id = generateId('pref');
    const scope = input.scope ?? 'global';
    const scopeValue = input.scope_value ?? null;

    // Upsert: delete existing for same person/dimension/scope/scope_value
    this.db
      .prepare('DELETE FROM person_preferences WHERE person_id = ? AND dimension = ? AND scope = ? AND scope_value IS ?')
      .run(input.person_id, input.dimension, scope, scopeValue);

    this.db
      .prepare(
        `INSERT INTO person_preferences (preference_id, person_id, dimension, value_numeric, scale_min, scale_max, scope, scope_value, confidence, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      )
      .run(
        id,
        input.person_id,
        input.dimension,
        input.value,
        input.scale_min ?? 0,
        input.scale_max ?? 10,
        scope,
        scopeValue,
        input.confidence ?? 'confirmed',
        input.source ?? 'explicit_user_statement',
      );

    writeAuditLog(this.db, {
      tool_name: 'kitchen_preference_set',
      entity_type: 'preference',
      entity_id: id,
      operation: 'upsert',
      after_data: { dimension: input.dimension, value: input.value, scope },
    });

    return this.get(input.person_id, input.dimension, scope, scopeValue)!;
  }

  getProfile(personIds: string[]): Record<string, PersonPreference[]> {
    const result: Record<string, PersonPreference[]> = {};
    for (const pid of personIds) {
      result[pid] = this.list(pid);
    }
    return result;
  }
}
