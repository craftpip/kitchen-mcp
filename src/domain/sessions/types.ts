export type SessionStatus =
  | 'planned'
  | 'preparing'
  | 'active'
  | 'paused'
  | 'completed'
  | 'abandoned'
  | 'failed';

export type SessionStepStatus =
  | 'pending'
  | 'ready'
  | 'active'
  | 'completed'
  | 'skipped'
  | 'failed'
  | 'blocked';

export type SessionEventType =
  | 'session_started'
  | 'session_paused'
  | 'session_resumed'
  | 'session_completed'
  | 'session_abandoned'
  | 'step_started'
  | 'step_completed'
  | 'step_skipped'
  | 'timer_created'
  | 'timer_expired'
  | 'ingredient_used'
  | 'ingredient_substituted'
  | 'quantity_adjusted'
  | 'problem_reported'
  | 'recovery_applied'
  | 'servings_adjusted';

export type ReservationStatus = 'active' | 'consumed' | 'released' | 'expired';

export type TimerType = 'check' | 'cook' | 'rest' | 'soak' | 'marinate' | 'cool' | 'defrost' | 'reminder';

export type TimerStatus = 'scheduled' | 'running' | 'paused' | 'expired' | 'acknowledged' | 'cancelled';

export type ProblemType =
  | 'ingredient_missing'
  | 'too_wet'
  | 'too_dry'
  | 'burning'
  | 'undercooked'
  | 'overcooked'
  | 'too_salty'
  | 'too_spicy'
  | 'wrong_texture'
  | 'equipment_failure'
  | 'spillage'
  | 'safety_concern'
  | 'other';

export interface CookingSession {
  session_id: string;
  household_id: string;
  recipe_id: string;
  recipe_version_id: string;
  name: string;
  servings: number;
  status: SessionStatus;
  current_step_id: string | null;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  total_paused_seconds: number;
  actual_duration_seconds: number | null;
  session_version: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionStep {
  session_step_id: string;
  session_id: string;
  source_recipe_step_id: string;
  sequence_number: number;
  title: string;
  action_type: string | null;
  instruction_text: string | null;
  instruction_data: Record<string, unknown>;
  required_equipment: string[];
  timer_recommended: boolean;
  safety_rule_ids: string[];
  status: SessionStepStatus;
  started_at: string | null;
  completed_at: string | null;
  actual_duration_seconds: number | null;
  notes: string | null;
  created_at: string;
}

export interface SessionEvent {
  event_id: string;
  session_id: string;
  event_type: SessionEventType;
  event_data: Record<string, unknown>;
  actor_type: string;
  request_id: string | null;
  created_at: string;
}

export interface IngredientReservation {
  reservation_id: string;
  session_id: string;
  inventory_lot_id: string;
  ingredient_id: string;
  reserved_quantity: number;
  reserved_unit: string;
  status: ReservationStatus;
  created_at: string;
}

export interface IngredientUsage {
  usage_id: string;
  session_id: string;
  session_step_id: string | null;
  inventory_lot_id: string;
  ingredient_id: string;
  quantity_used: number;
  unit: string;
  created_at: string;
}

export interface KitchenTimer {
  timer_id: string;
  household_id: string;
  session_id: string | null;
  session_step_id: string | null;
  name: string;
  timer_type: TimerType;
  status: TimerStatus;
  duration_seconds: number;
  started_at: string | null;
  due_at: string | null;
  paused_remaining_seconds: number | null;
  completed_at: string | null;
  acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StartSessionInput {
  household_id?: string;
  recipe_id: string;
  servings?: number;
  name?: string;
  notes?: string;
}

export interface CompleteStepInput {
  session_id: string;
  session_step_id: string;
  ingredient_usage?: { ingredient_id: string; inventory_lot_id: string; quantity_used: number; unit: string }[];
  notes?: string;
}

export interface ReportProblemInput {
  session_id: string;
  session_step_id?: string;
  problem_type: ProblemType;
  description?: string;
  recovery_actions?: string[];
}

export interface SubstituteIngredientInput {
  session_id: string;
  original_ingredient_id: string;
  substitute_ingredient_id: string;
  inventory_lot_id: string;
  quantity_used: number;
  unit: string;
  session_step_id?: string;
}

export interface CreateTimerInput {
  household_id?: string;
  session_id?: string;
  session_step_id?: string;
  name: string;
  timer_type?: TimerType;
  duration_seconds: number;
}
