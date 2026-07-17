import { z } from 'zod';
import type { ServerContext } from '../create-server.js';
import { TimerService } from '../../domain/sessions/timer-service.js';
import { success } from '../../shared/response.js';
import { toolHandler } from './handler.js';

const TimerTypeSchema = z.enum(['check', 'cook', 'rest', 'soak', 'marinate', 'cool', 'defrost', 'reminder']);

export function registerTimerTools(ctx: ServerContext): void {
  const { mcpServer, db } = ctx;
  const service = new TimerService(db);

  mcpServer.tool(
    'kitchen_timer_create',
    'Create a kitchen timer (optionally tied to a cooking session)',
    {
      name: z.string().describe('Timer name'),
      duration_seconds: z.number().describe('Duration in seconds'),
      timer_type: TimerTypeSchema.optional().describe('Timer type (default: check)'),
      session_id: z.string().optional().describe('Associated session ID'),
      session_step_id: z.string().optional().describe('Associated step ID'),
      household_id: z.string().optional().describe('Household ID (default: hh_default)'),
    },
    async (args) => toolHandler(() => {
      const timer = service.create(args);
      return success('TIMER_CREATED', { timer });
    }),
  );

  mcpServer.tool(
    'kitchen_timer_list_active',
    'List all active timers (running, paused, scheduled)',
    {
      household_id: z.string().optional().describe('Filter by household ID'),
    },
    async (args) => toolHandler(() => {
      const timers = service.listActive(args.household_id);
      return success('TIMERS_LISTED', { timers, count: timers.length });
    }),
  );

  mcpServer.tool(
    'kitchen_timer_get',
    'Get a single timer by ID',
    {
      timer_id: z.string().describe('Timer ID'),
    },
    async (args) => toolHandler(() => {
      const timer = service.get(args.timer_id);
      if (!timer) {
        throw new Error('Timer not found');
      }
      return success('TIMER_RETRIEVED', { timer });
    }),
  );

  mcpServer.tool(
    'kitchen_timer_pause',
    'Pause a running timer',
    {
      timer_id: z.string().describe('Timer ID'),
    },
    async (args) => toolHandler(() => {
      const timer = service.pause(args.timer_id);
      return success('TIMER_PAUSED', { timer });
    }),
  );

  mcpServer.tool(
    'kitchen_timer_resume',
    'Resume a paused timer',
    {
      timer_id: z.string().describe('Timer ID'),
    },
    async (args) => toolHandler(() => {
      const timer = service.resume(args.timer_id);
      return success('TIMER_RESUMED', { timer });
    }),
  );

  mcpServer.tool(
    'kitchen_timer_extend',
    'Extend a timer by additional seconds',
    {
      timer_id: z.string().describe('Timer ID'),
      additional_seconds: z.number().describe('Seconds to add'),
    },
    async (args) => toolHandler(() => {
      const timer = service.extend(args.timer_id, args.additional_seconds);
      return success('TIMER_EXTENDED', { timer });
    }),
  );

  mcpServer.tool(
    'kitchen_timer_acknowledge',
    'Acknowledge an expired timer',
    {
      timer_id: z.string().describe('Timer ID'),
    },
    async (args) => toolHandler(() => {
      const timer = service.acknowledge(args.timer_id);
      return success('TIMER_ACKNOWLEDGED', { timer });
    }),
  );

  mcpServer.tool(
    'kitchen_timer_cancel',
    'Cancel a timer',
    {
      timer_id: z.string().describe('Timer ID'),
    },
    async (args) => toolHandler(() => {
      const timer = service.cancel(args.timer_id);
      return success('TIMER_CANCELLED', { timer });
    }),
  );

  mcpServer.tool(
    'kitchen_timer_tick',
    'Check for expired timers and update their status (call periodically)',
    {},
    async () => toolHandler(() => {
      const expired = service.tick();
      return success('TIMERS_TICKED', { expired, count: expired.length });
    }),
  );
}
