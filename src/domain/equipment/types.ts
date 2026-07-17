export const EquipmentType = {
  STOVE: 'stove',
  BURNER: 'burner',
  INDUCTION_COOKTOP: 'induction_cooktop',
  OVEN: 'oven',
  MICROWAVE: 'microwave',
  AIR_FRYER: 'air_fryer',
  PRESSURE_COOKER: 'pressure_cooker',
  RICE_COOKER: 'rice_cooker',
  KADAI: 'kadai',
  PAN: 'pan',
  SAUCEPAN: 'saucepan',
  POT: 'pot',
  KNIFE: 'knife',
  CHOPPING_BOARD: 'chopping_board',
  MIXER: 'mixer',
  BLENDER: 'blender',
  WEIGHING_SCALE: 'weighing_scale',
  MEASURING_CUP: 'measuring_cup',
  MEASURING_SPOON: 'measuring_spoon',
  STORAGE_CONTAINER: 'storage_container',
  THERMOMETER: 'thermometer',
  STRAINER: 'strainer',
  OTHER: 'other',
} as const;

export type EquipmentType = (typeof EquipmentType)[keyof typeof EquipmentType];

export const EquipmentCondition = {
  WORKING: 'working',
  NEEDS_REPAIR: 'needs_repair',
  BROKEN: 'broken',
  MISSING: 'missing',
} as const;

export type EquipmentCondition = (typeof EquipmentCondition)[keyof typeof EquipmentCondition];

export const EquipmentAvailability = {
  AVAILABLE: 'available',
  IN_USE: 'in_use',
  DIRTY: 'dirty',
  BROKEN: 'broken',
  MISSING: 'missing',
} as const;

export type EquipmentAvailability = (typeof EquipmentAvailability)[keyof typeof EquipmentAvailability];

export interface Equipment {
  equipment_id: string;
  household_id: string;
  name: string;
  equipment_type: EquipmentType;
  capacity_value: number | null;
  capacity_unit: string | null;
  manufacturer: string | null;
  model: string | null;
  condition: EquipmentCondition;
  available: boolean;
  location_id: string | null;
  capabilities: string[];
  safety_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContainerCalibration {
  container_id: string;
  equipment_id: string;
  capacity_ml: number;
  capacity_confidence: string;
  tare_weight_g: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateEquipmentInput {
  household_id: string;
  name: string;
  equipment_type: EquipmentType;
  capacity_value?: number;
  capacity_unit?: string;
  manufacturer?: string;
  model?: string;
  condition?: EquipmentCondition;
  available?: boolean;
  location_id?: string;
  capabilities?: string[];
  safety_profile_id?: string;
}

export interface UpdateEquipmentInput {
  equipment_id: string;
  name?: string;
  capacity_value?: number;
  capacity_unit?: string;
  manufacturer?: string;
  model?: string;
  condition?: EquipmentCondition;
  location_id?: string | null;
  capabilities?: string[];
  safety_profile_id?: string | null;
}
