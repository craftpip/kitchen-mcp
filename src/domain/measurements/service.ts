import type Database from 'better-sqlite3';
import { kitchenError, ErrorCode } from '../../shared/errors/catalogue.js';

interface UnitRow {
  unit_id: string;
  name: string;
  system: string;
  base_unit: string | null;
  factor_to_base: number | null;
  category: string;
}

export class MeasurementService {
  private units: Map<string, UnitRow> = new Map();

  constructor(private db: Database.Database) {
    this.loadUnits();
  }

  private loadUnits(): void {
    const rows = this.db.prepare('SELECT * FROM measurement_units').all() as UnitRow[];
    for (const row of rows) {
      this.units.set(row.name, row);
    }
  }

  convert(value: number, fromUnit: string, toUnit: string, _options?: { ingredient_id?: string }): {
    value: number;
    unit: string;
    confidence: string;
  } {
    const from = this.units.get(fromUnit);
    const to = this.units.get(toUnit);

    if (!from) {
      throw kitchenError(ErrorCode.INVALID_UNIT, `Unknown unit: ${fromUnit}`, {
        details: { unit: fromUnit },
      });
    }
    if (!to) {
      throw kitchenError(ErrorCode.INVALID_UNIT, `Unknown unit: ${toUnit}`, {
        details: { unit: toUnit },
      });
    }

    if (from.category !== to.category) {
      throw kitchenError(ErrorCode.INCOMPATIBLE_UNITS, `Cannot convert between ${from.category} and ${to.category}`, {
        details: { from_unit: fromUnit, to_unit: toUnit, from_category: from.category, to_category: to.category },
      });
    }

    if (from.category === 'count') {
      return { value, unit: toUnit, confidence: 'exact' };
    }

    if (from.factor_to_base === null || to.factor_to_base === null) {
      throw kitchenError(ErrorCode.INVALID_UNIT, `Cannot convert ${fromUnit} to ${toUnit}`, {
        details: { from_unit: fromUnit, to_unit: toUnit },
      });
    }

    const baseValue = value * from.factor_to_base;
    const result = baseValue / to.factor_to_base;

    return {
      value: Math.round(result * 1000) / 1000,
      unit: toUnit,
      confidence: 'exact',
    };
  }

  expressInHousehold(valueMl: number, calibrations: { equipment_name: string; capacity_ml: number }[]): {
    container: string;
    count: number;
    remainder_ml: number;
  }[] {
    if (calibrations.length === 0) {
      return [];
    }

    const sorted = [...calibrations].sort((a, b) => b.capacity_ml - a.capacity_ml);
    const results: { container: string; count: number; remainder_ml: number }[] = [];
    let remaining = valueMl;

    for (const cal of sorted) {
      if (remaining <= 0) break;
      const count = Math.floor(remaining / cal.capacity_ml);
      if (count > 0) {
        results.push({
          container: cal.equipment_name,
          count,
          remainder_ml: Math.round((remaining - count * cal.capacity_ml) * 100) / 100,
        });
        remaining = remaining - count * cal.capacity_ml;
      }
    }

    return results;
  }

  estimatePieceWeight(ingredientId: string): {
    average_weight_g: number;
    confidence: string;
  } | null {
    const row = this.db
      .prepare('SELECT average_piece_weight_g FROM ingredient_catalog WHERE ingredient_id = ?')
      .get(ingredientId) as { average_piece_weight_g: number | null } | undefined;

    if (!row || row.average_piece_weight_g === null) {
      return null;
    }

    return {
      average_weight_g: row.average_piece_weight_g,
      confidence: 'catalog_average',
    };
  }
}
