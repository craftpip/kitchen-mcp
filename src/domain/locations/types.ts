export const LocationType = {
  ROOM: 'room',
  SHELF: 'shelf',
  DRAWER: 'drawer',
  CABINET: 'cabinet',
  DOOR: 'door',
  COUNTER: 'counter',
  BIN: 'bin',
  CONTAINER: 'container',
  OTHER: 'other',
} as const;

export type LocationType = (typeof LocationType)[keyof typeof LocationType];

export const StorageEnvironment = {
  AMBIENT: 'ambient',
  COOL_DRY: 'cool_dry',
  REFRIGERATED: 'refrigerated',
  FROZEN: 'frozen',
  HEATED: 'heated',
  TEMPORARY: 'temporary',
  UNKNOWN: 'unknown',
} as const;

export type StorageEnvironment = (typeof StorageEnvironment)[keyof typeof StorageEnvironment];

export interface Location {
  location_id: string;
  household_id: string;
  parent_location_id: string | null;
  name: string;
  location_type: LocationType;
  storage_environment: StorageEnvironment;
  temperature_min_c: number | null;
  temperature_max_c: number | null;
  position_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LocationWithChildren extends Location {
  children: LocationWithChildren[];
}

export interface CreateLocationInput {
  household_id: string;
  parent_location_id?: string;
  name: string;
  location_type: LocationType;
  storage_environment: StorageEnvironment;
  temperature_min_c?: number;
  temperature_max_c?: number;
  position_order?: number;
}
