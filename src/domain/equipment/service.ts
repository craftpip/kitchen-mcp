import type Database from 'better-sqlite3';
import { generateId } from '../../shared/ids.js';
import { kitchenError, ErrorCode } from '../../shared/errors/catalogue.js';
import { writeAuditLog } from '../../infrastructure/audit.js';
import type {
  Equipment,
  EquipmentType,
  EquipmentCondition,
  CreateEquipmentInput,
  UpdateEquipmentInput,
} from './types.js';

interface EquipmentRow {
  equipment_id: string;
  household_id: string;
  name: string;
  equipment_type: string;
  capacity_value: number | null;
  capacity_unit: string | null;
  manufacturer: string | null;
  model: string | null;
  condition: string;
  available: number;
  location_id: string | null;
  capabilities: string;
  safety_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToEquipment(row: EquipmentRow): Equipment {
  return {
    ...row,
    equipment_type: row.equipment_type as EquipmentType,
    condition: row.condition as EquipmentCondition,
    available: row.available === 1,
    capabilities: JSON.parse(row.capabilities),
  };
}

export class EquipmentService {
  constructor(private db: Database.Database) {}

  list(householdId: string, options?: { equipment_type?: string; available_only?: boolean; limit?: number }): Equipment[] {
    const conditions = ['household_id = ?'];
    const params: unknown[] = [householdId];

    if (options?.equipment_type) {
      conditions.push('equipment_type = ?');
      params.push(options.equipment_type);
    }
    if (options?.available_only) {
      conditions.push('available = 1');
    }

    const limit = options?.limit ?? 50;
    const rows = this.db
      .prepare(
        `SELECT * FROM equipment WHERE ${conditions.join(' AND ')} ORDER BY name LIMIT ?`,
      )
      .all(...params, limit) as EquipmentRow[];
    return rows.map(rowToEquipment);
  }

  get(equipmentId: string): Equipment | undefined {
    const row = this.db
      .prepare('SELECT * FROM equipment WHERE equipment_id = ?')
      .get(equipmentId) as EquipmentRow | undefined;
    return row ? rowToEquipment(row) : undefined;
  }

  create(input: CreateEquipmentInput): Equipment {
    const id = generateId('eq');
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO equipment (equipment_id, household_id, name, equipment_type, capacity_value, capacity_unit, manufacturer, model, condition, available, location_id, capabilities, safety_profile_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.household_id,
        input.name,
        input.equipment_type,
        input.capacity_value ?? null,
        input.capacity_unit ?? null,
        input.manufacturer ?? null,
        input.model ?? null,
        input.condition ?? 'working',
        input.available !== false ? 1 : 0,
        input.location_id ?? null,
        JSON.stringify(input.capabilities ?? []),
        input.safety_profile_id ?? null,
        now,
        now,
      );

    writeAuditLog(this.db, {
      tool_name: 'kitchen_equipment_add',
      entity_type: 'equipment',
      entity_id: id,
      operation: 'create',
      after_data: { ...input, household_id: undefined },
    });

    return this.get(id)!;
  }

  update(input: UpdateEquipmentInput): Equipment {
    const existing = this.get(input.equipment_id);
    if (!existing) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Equipment not found', {
        details: { equipment_id: input.equipment_id },
      });
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (input.name !== undefined) { updates.push('name = ?'); params.push(input.name); }
    if (input.capacity_value !== undefined) { updates.push('capacity_value = ?'); params.push(input.capacity_value); }
    if (input.capacity_unit !== undefined) { updates.push('capacity_unit = ?'); params.push(input.capacity_unit); }
    if (input.manufacturer !== undefined) { updates.push('manufacturer = ?'); params.push(input.manufacturer); }
    if (input.model !== undefined) { updates.push('model = ?'); params.push(input.model); }
    if (input.condition !== undefined) { updates.push('condition = ?'); params.push(input.condition); }
    if (input.location_id !== undefined) { updates.push('location_id = ?'); params.push(input.location_id); }
    if (input.capabilities !== undefined) { updates.push('capabilities = ?'); params.push(JSON.stringify(input.capabilities)); }
    if (input.safety_profile_id !== undefined) { updates.push('safety_profile_id = ?'); params.push(input.safety_profile_id); }

    if (updates.length === 0) return existing;

    updates.push("updated_at = datetime('now')");
    params.push(input.equipment_id);

    this.db
      .prepare(`UPDATE equipment SET ${updates.join(', ')} WHERE equipment_id = ?`)
      .run(...params);

    writeAuditLog(this.db, {
      tool_name: 'kitchen_equipment_update',
      entity_type: 'equipment',
      entity_id: input.equipment_id,
      operation: 'update',
      before_data: { name: existing.name, condition: existing.condition, available: existing.available },
      after_data: { ...input } as Record<string, unknown>,
    });

    return this.get(input.equipment_id)!;
  }

  setAvailability(equipmentId: string, available: boolean): Equipment {
    const existing = this.get(equipmentId);
    if (!existing) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Equipment not found', {
        details: { equipment_id: equipmentId },
      });
    }

    this.db
      .prepare("UPDATE equipment SET available = ?, updated_at = datetime('now') WHERE equipment_id = ?")
      .run(available ? 1 : 0, equipmentId);

    return this.get(equipmentId)!;
  }

  calibrateContainer(equipmentId: string, capacityMl: number, confidence: string, tareWeightG?: number) {
    const equipment = this.get(equipmentId);
    if (!equipment) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Equipment not found', {
        details: { equipment_id: equipmentId },
      });
    }

    const existing = this.db
      .prepare('SELECT container_id FROM container_calibrations WHERE equipment_id = ?')
      .get(equipmentId) as { container_id: string } | undefined;

    const now = new Date().toISOString();

    if (existing) {
      this.db
        .prepare(
          `UPDATE container_calibrations
           SET capacity_ml = ?, capacity_confidence = ?, tare_weight_g = ?, updated_at = datetime('now')
           WHERE equipment_id = ?`,
        )
        .run(capacityMl, confidence, tareWeightG ?? null, equipmentId);

      return this.db
        .prepare('SELECT * FROM container_calibrations WHERE equipment_id = ?')
        .get(equipmentId);
    }

    const id = generateId('cal');
    this.db
      .prepare(
        `INSERT INTO container_calibrations (container_id, equipment_id, capacity_ml, capacity_confidence, tare_weight_g, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, equipmentId, capacityMl, confidence, tareWeightG ?? null, now, now);

    return this.db
      .prepare('SELECT * FROM container_calibrations WHERE container_id = ?')
      .get(id);
  }

  getContainerCalibrations(householdId: string) {
    return this.db
      .prepare(
        `SELECT cc.*, e.name as equipment_name, e.equipment_type
         FROM container_calibrations cc
         JOIN equipment e ON e.equipment_id = cc.equipment_id
         WHERE e.household_id = ?
         ORDER BY cc.capacity_ml`,
      )
      .all(householdId);
  }
}
