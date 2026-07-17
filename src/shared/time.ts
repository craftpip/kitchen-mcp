export function nowUtc(): string {
  return new Date().toISOString();
}

export function parseUtc(iso: string): Date {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ISO timestamp: ${iso}`);
  }
  return d;
}

export function addSeconds(iso: string, seconds: number): string {
  const d = parseUtc(iso);
  d.setSeconds(d.getSeconds() + seconds);
  return d.toISOString();
}

export function addMinutes(iso: string, minutes: number): string {
  return addSeconds(iso, minutes * 60);
}

export function diffSeconds(a: string, b: string): number {
  return (parseUtc(b).getTime() - parseUtc(a).getTime()) / 1000;
}
