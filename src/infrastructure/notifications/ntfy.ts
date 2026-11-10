import { createChildLogger } from '../logging.js';

const log = createChildLogger('ntfy');

interface NtfyConfig {
  topic: string;
  baseUrl: string;
}

function getConfig(): NtfyConfig | null {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return null;
  return {
    topic,
    baseUrl: process.env.NTFY_BASE_URL ?? 'https://ntfy.sh',
  };
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}

export async function sendNtfyNotification(opts: {
  title: string;
  message: string;
  tags?: string[];
  priority?: 1 | 2 | 3 | 4 | 5;
  clickUrl?: string;
}): Promise<void> {
  const config = getConfig();
  if (!config) return;

  const url = `${config.baseUrl}/${encodeURIComponent(config.topic)}`;

  try {
    const body: Record<string, unknown> = {
      topic: config.topic,
      title: truncate(opts.title, 80),
      message: truncate(opts.message, 500),
    };
    if (opts.tags) body.tags = opts.tags;
    if (opts.priority) body.priority = opts.priority;
    if (opts.clickUrl) body.click = opts.clickUrl;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      log.warn({ status: response.status, topic: config.topic }, 'ntfy notification failed');
    }
  } catch (err) {
    log.warn({ err }, 'ntfy notification error');
  }
}

export function timerExpiredNotification(timerName: string, durationMinutes: number, sessionName?: string) {
  const sessionPart = sessionName ? `\nSession: ${sessionName}` : '';
  return sendNtfyNotification({
    title: `⏰ Timer Expired: ${timerName}`,
    message: `Your "${timerName}" timer (${durationMinutes}m) is up!${sessionPart}\nCheck on it now.`,
    tags: ['timer', 'bell'],
    priority: 4,
  });
}

export function sessionCompleteNotification(recipeName: string, durationMinutes: number) {
  return sendNtfyNotification({
    title: `✅ Cooking Done: ${recipeName}`,
    message: `Finished cooking "${recipeName}" in ${durationMinutes} minutes.\nTime to eat!`,
    tags: ['tada', 'cooking'],
    priority: 3,
  });
}

export function sessionAbandonedNotification(recipeName: string) {
  return sendNtfyNotification({
    title: `🚫 Session Abandoned: ${recipeName}`,
    message: `Cooking session for "${recipeName}" was abandoned.`,
    tags: ['x', 'cooking'],
    priority: 2,
  });
}

export function problemReportedNotification(
  recipeName: string,
  problemType: string,
  description: string | undefined,
) {
  return sendNtfyNotification({
    title: `⚠️ Cooking Problem: ${recipeName}`,
    message: `Problem: ${problemType}${description ? ` — ${description}` : ''}\nCheck the session and apply recovery.`,
    tags: ['warning', 'cooking'],
    priority: 4,
  });
}
