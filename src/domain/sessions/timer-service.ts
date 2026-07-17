import type Database from 'better-sqlite3';
import { generateId } from '../../shared/ids.js';
import { kitchenError, ErrorCode } from '../../shared/errors/catalogue.js';
import type { KitchenTimer, TimerType, TimerStatus, CreateTimerInput } from './types.js';

interface TimerRow {
  timer_id: string;
  household_id: string;
  session_id: string | null;
  session_step_id: string | null;
  name: string;
  timer_type: string;
  status: string;
  duration_seconds: number;
  started_at: string | null;
  due_at: string | null;
  paused_remaining_seconds: number | null;
  completed_at: string | null;
  acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTimer(row: TimerRow): KitchenTimer {
  return {
    ...row,
    timer_type: row.timer_type as TimerType,
    status: row.status as TimerStatus,
  };
}

export class TimerService {
  constructor(private db: Database.Database) {}

  create(input: CreateTimerInput): KitchenTimer {
    const householdId = input.household_id ?? 'hh_default';
    const timerType = input.timer_type ?? 'check';
    const id = generateId('timer');
    const now = new Date().toISOString();
    const dueAt = new Date(Date.now() + input.duration_seconds * 1000).toISOString();

    this.db
      .prepare(
        `INSERT INTO timers (timer_id, household_id, session_id, session_step_id, name, timer_type, status, duration_seconds, started_at, due_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?)`,
      )
      .run(id, householdId, input.session_id ?? null, input.session_step_id ?? null, input.name, timerType, input.duration_seconds, now, dueAt, now, now);

    if (input.session_id) {
      this.db
        .prepare(
          `INSERT INTO cooking_session_events (event_id, session_id, event_type, event_data, actor_type, created_at)
           VALUES (?, ?, 'timer_created', ?, 'mcp_client', datetime('now'))`,
        )
        .run(generateId('evt'), input.session_id, JSON.stringify({ timer_id: id, name: input.name, duration_seconds: input.duration_seconds }));
    }

    return this.get(id)!;
  }

  get(timerId: string): KitchenTimer | undefined {
    const row = this.db.prepare('SELECT * FROM timers WHERE timer_id = ?').get(timerId) as TimerRow | undefined;
    return row ? rowToTimer(row) : undefined;
  }

  listActive(householdId?: string): KitchenTimer[] {
    const conditions = ["status IN ('running', 'paused', 'scheduled')"];
    const params: unknown[] = [];

    if (householdId) {
      conditions.push('household_id = ?');
      params.push(householdId);
    }

    return this.db
      .prepare(`SELECT * FROM timers WHERE ${conditions.join(' AND ')} ORDER BY due_at ASC`)
      .all(...params)
      .map((row) => rowToTimer(row as TimerRow));
  }

  pause(timerId: string): KitchenTimer {
    const timer = this.get(timerId);
    if (!timer) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Timer not found');
    }
    if (timer.status !== 'running') {
      throw kitchenError(ErrorCode.INVALID_STATE_TRANSITION, `Timer must be running to pause, current: ${timer.status}`);
    }

    const remaining = timer.due_at
      ? Math.max(0, Math.floor((new Date(timer.due_at).getTime() - Date.now()) / 1000))
      : timer.duration_seconds;

    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE timers SET status = 'paused', paused_remaining_seconds = ?, updated_at = ? WHERE timer_id = ?")
      .run(remaining, now, timerId);

    return this.get(timerId)!;
  }

  resume(timerId: string): KitchenTimer {
    const timer = this.get(timerId);
    if (!timer) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Timer not found');
    }
    if (timer.status !== 'paused') {
      throw kitchenError(ErrorCode.INVALID_STATE_TRANSITION, `Timer must be paused to resume, current: ${timer.status}`);
    }

    const remaining = timer.paused_remaining_seconds ?? timer.duration_seconds;
    const now = new Date().toISOString();
    const newDueAt = new Date(Date.now() + remaining * 1000).toISOString();

    this.db
      .prepare("UPDATE timers SET status = 'running', paused_remaining_seconds = NULL, due_at = ?, updated_at = ? WHERE timer_id = ?")
      .run(newDueAt, now, timerId);

    return this.get(timerId)!;
  }

  extend(timerId: string, additionalSeconds: number): KitchenTimer {
    const timer = this.get(timerId);
    if (!timer) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Timer not found');
    }
    if (timer.status === 'cancelled' || timer.status === 'acknowledged') {
      throw kitchenError(ErrorCode.INVALID_STATE_TRANSITION, `Timer cannot be extended in ${timer.status} state`);
    }

    const now = new Date().toISOString();
    let newDueAt: string;
    let newDuration: number;

    if (timer.status === 'running') {
      newDueAt = new Date(Date.now() + additionalSeconds * 1000).toISOString();
      newDuration = timer.duration_seconds + additionalSeconds;
    } else if (timer.status === 'paused') {
      const remaining = (timer.paused_remaining_seconds ?? timer.duration_seconds) + additionalSeconds;
      newDuration = timer.duration_seconds + additionalSeconds;
      this.db
        .prepare("UPDATE timers SET duration_seconds = ?, paused_remaining_seconds = ?, updated_at = ? WHERE timer_id = ?")
        .run(newDuration, remaining, now, timerId);
      return this.get(timerId)!;
    } else {
      newDueAt = new Date(Date.now() + additionalSeconds * 1000).toISOString();
      newDuration = timer.duration_seconds + additionalSeconds;
    }

    this.db
      .prepare('UPDATE timers SET duration_seconds = ?, due_at = ?, updated_at = ? WHERE timer_id = ?')
      .run(newDuration, newDueAt, now, timerId);

    return this.get(timerId)!;
  }

  acknowledge(timerId: string): KitchenTimer {
    const timer = this.get(timerId);
    if (!timer) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Timer not found');
    }
    if (timer.status !== 'expired') {
      throw kitchenError(ErrorCode.INVALID_STATE_TRANSITION, `Timer must be expired to acknowledge, current: ${timer.status}`);
    }

    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE timers SET status = 'acknowledged', acknowledged_at = ?, updated_at = ? WHERE timer_id = ?")
      .run(now, now, timerId);

    if (timer.session_id) {
      this.db
        .prepare(
          `INSERT INTO cooking_session_events (event_id, session_id, event_type, event_data, actor_type, created_at)
           VALUES (?, ?, 'timer_expired', ?, 'mcp_client', datetime('now'))`,
        )
        .run(generateId('evt'), timer.session_id, JSON.stringify({ timer_id: timerId, name: timer.name }));
    }

    return this.get(timerId)!;
  }

  cancel(timerId: string): KitchenTimer {
    const timer = this.get(timerId);
    if (!timer) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Timer not found');
    }
    if (timer.status === 'acknowledged' || timer.status === 'cancelled') {
      throw kitchenError(ErrorCode.INVALID_STATE_TRANSITION, `Timer is already ${timer.status}`);
    }

    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE timers SET status = 'cancelled', updated_at = ? WHERE timer_id = ?")
      .run(now, timerId);

    return this.get(timerId)!;
  }

  tick(): KitchenTimer[] {
    const now = new Date().toISOString();
    const expired = this.db
      .prepare("SELECT * FROM timers WHERE status = 'running' AND due_at <= ?")
      .all(now) as TimerRow[];

    if (expired.length === 0) return [];

    this.db
      .prepare("UPDATE timers SET status = 'expired', completed_at = ?, updated_at = ? WHERE status = 'running' AND due_at <= ?")
      .run(now, now, now);

    for (const timer of expired) {
      if (timer.session_id) {
        this.db
          .prepare(
            `INSERT INTO cooking_session_events (event_id, session_id, event_type, event_data, actor_type, created_at)
             VALUES (?, ?, 'timer_expired', ?, 'mcp_client', datetime('now'))`,
          )
          .run(generateId('evt'), timer.session_id, JSON.stringify({ timer_id: timer.timer_id, name: timer.name }));
      }
    }

    return expired.map((row) => rowToTimer(row as TimerRow));
  }

  listBySession(sessionId: string): KitchenTimer[] {
    return this.db
      .prepare('SELECT * FROM timers WHERE session_id = ? ORDER BY created_at DESC')
      .all(sessionId)
      .map((row) => rowToTimer(row as TimerRow));
  }
}
