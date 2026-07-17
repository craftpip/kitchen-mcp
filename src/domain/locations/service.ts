import type Database from 'better-sqlite3';
import { generateId } from '../../shared/ids.js';
import { kitchenError, ErrorCode } from '../../shared/errors/catalogue.js';
import type {
  Location,
  LocationWithChildren,
  CreateLocationInput,
  LocationType,
  StorageEnvironment,
} from './types.js';

interface LocationRow {
  location_id: string;
  household_id: string;
  parent_location_id: string | null;
  name: string;
  location_type: string;
  storage_environment: string;
  temperature_min_c: number | null;
  temperature_max_c: number | null;
  position_order: number;
  active: number;
  created_at: string;
  updated_at: string;
}

function rowToLocation(row: LocationRow): Location {
  return {
    ...row,
    location_type: row.location_type as LocationType,
    storage_environment: row.storage_environment as StorageEnvironment,
    active: row.active === 1,
  };
}

export class LocationService {
  constructor(private db: Database.Database) {}

  list(householdId: string, parentLocationId?: string): Location[] {
    if (parentLocationId !== undefined) {
      const rows = this.db
        .prepare(
          'SELECT * FROM locations WHERE household_id = ? AND parent_location_id = ? AND active = 1 ORDER BY position_order, name',
        )
        .all(householdId, parentLocationId) as LocationRow[];
      return rows.map(rowToLocation);
    }

    const rows = this.db
      .prepare(
        'SELECT * FROM locations WHERE household_id = ? AND active = 1 ORDER BY position_order, name',
      )
      .all(householdId) as LocationRow[];
    return rows.map(rowToLocation);
  }

  get(locationId: string): Location | undefined {
    const row = this.db
      .prepare('SELECT * FROM locations WHERE location_id = ?')
      .get(locationId) as LocationRow | undefined;
    return row ? rowToLocation(row) : undefined;
  }

  getTree(householdId: string): LocationWithChildren[] {
    const all = this.list(householdId);
    return this.buildTree(all, null);
  }

  private buildTree(all: Location[], parentId: string | null): LocationWithChildren[] {
    return all
      .filter((loc) => loc.parent_location_id === parentId)
      .map((loc) => ({
        ...loc,
        children: this.buildTree(all, loc.location_id),
      }));
  }

  create(input: CreateLocationInput): Location {
    if (input.parent_location_id) {
      const parent = this.get(input.parent_location_id);
      if (!parent) {
        throw kitchenError(ErrorCode.NOT_FOUND, 'Parent location not found', {
          details: { parent_location_id: input.parent_location_id },
        });
      }
      if (parent.household_id !== input.household_id) {
        throw kitchenError(ErrorCode.INVALID_ARGUMENT, 'Parent location belongs to different household', {
          details: { parent_location_id: input.parent_location_id },
        });
      }
    }

    const id = generateId('loc');
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO locations (location_id, household_id, parent_location_id, name, location_type, storage_environment, temperature_min_c, temperature_max_c, position_order, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        id,
        input.household_id,
        input.parent_location_id ?? null,
        input.name,
        input.location_type,
        input.storage_environment,
        input.temperature_min_c ?? null,
        input.temperature_max_c ?? null,
        input.position_order ?? 0,
        now,
        now,
      );

    return this.get(id)!;
  }
}
