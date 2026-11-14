/** Business-minute SLA math in an IANA timezone. Instants remain ISO UTC.
 * Legacy demo/test calendars without a timezone are explicitly UTC; new policies
 * use Africa/Lagos and local working hours (never manually shifted hours).
 */
import type { ImpactUrgency, Priority, SlaPolicy } from './types';
import { DAYS, MINUTES } from './util';

export const PRIORITY_MATRIX: Record<ImpactUrgency, Record<ImpactUrgency, Priority>> = {
  high: { high: 'critical', medium: 'high', low: 'high' },
  medium: { high: 'high', medium: 'medium', low: 'medium' },
  low: { high: 'medium', medium: 'low', low: 'low' },
};
export function priorityFrom(impact: ImpactUrgency, urgency: ImpactUrgency): Priority { return PRIORITY_MATRIX[impact][urgency]; }
export const DEFAULT_SLA_TARGETS: SlaPolicy['targets'] = {
  critical: { response: 15, resolve: 240 }, high: { response: 30, resolve: 480 },
  medium: { response: 240, resolve: 960 }, low: { response: 480, resolve: 2400 },
};
export type WorkCal = Pick<SlaPolicy, 'workStartHour' | 'workEndHour' | 'workDays' | 'holidays'> & { timezone?: string };
export function defaultCalendar(timezone = 'Africa/Lagos'): WorkCal {
  return { workStartHour: 8, workEndHour: 18, workDays: [1, 2, 3, 4, 5], holidays: [], timezone };
}
function offsetAt(ms: number, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}
function localParts(ms: number, zone: string) {
  const d = new Date(ms + offsetAt(ms, zone));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(), weekday: d.getUTCDay(), key: d.toISOString().slice(0, 10) };
}
function wallTime(year: number, month: number, day: number, hour: number, zone: string): number {
  const wall = Date.UTC(year, month, day, hour);
  let guess = wall - offsetAt(wall, zone);
  guess = wall - offsetAt(guess, zone);
  return guess;
}
export function isWorkDay(d: Date, cal: WorkCal): boolean {
  const p = localParts(d.getTime(), cal.timezone ?? 'UTC');
  return cal.workDays.includes(p.weekday) && !cal.holidays.includes(p.key);
}
function hours(ms: number, cal: WorkCal) {
  const p = localParts(ms, cal.timezone ?? 'UTC');
  return { open: wallTime(p.year, p.month, p.day, cal.workStartHour, cal.timezone ?? 'UTC'), close: wallTime(p.year, p.month, p.day, cal.workEndHour, cal.timezone ?? 'UTC') };
}
function nextDay(ms: number, cal: WorkCal): number {
  const p = localParts(ms, cal.timezone ?? 'UTC');
  return wallTime(p.year, p.month, p.day + 1, 0, cal.timezone ?? 'UTC');
}
export function nextWorkStart(t: Date, cal: WorkCal): Date {
  let ms = t.getTime();
  if (!Number.isFinite(ms)) throw new Error('Invalid SLA start date');
  for (let i = 0; i < 370; i++) {
    if (isWorkDay(new Date(ms), cal)) {
      const { open, close } = hours(ms, cal);
      if (ms < open) return new Date(open);
      if (ms < close) return new Date(ms);
    }
    ms = nextDay(ms, cal);
  }
  throw new Error('SLA calendar has no working day in the next year');
}
export function addBusinessMinutes(fromIso: string, businessMinutes: number, cal: WorkCal): string {
  if (!Number.isFinite(businessMinutes) || businessMinutes < 0) throw new Error('Invalid SLA duration');
  let cursor = nextWorkStart(new Date(fromIso), cal).getTime();
  let remaining = Math.floor(businessMinutes);
  for (let guard = 0; guard < 1500 && remaining > 0; guard++) {
    const { close } = hours(cursor, cal);
    const available = Math.max(0, Math.floor((close - cursor) / MINUTES));
    if (available >= remaining) return new Date(cursor + remaining * MINUTES).toISOString();
    remaining -= available;
    cursor = nextWorkStart(new Date(nextDay(cursor, cal)), cal).getTime();
  }
  if (remaining > 0) throw new Error('SLA duration exceeds the supported calendar horizon');
  return new Date(cursor).toISOString();
}
export function businessMinutesBetween(aIso: string, bIso: string, cal: WorkCal): number {
  let from = new Date(aIso).getTime(); const to = new Date(bIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) throw new Error('Invalid SLA interval');
  if (to <= from) return 0;
  let total = 0;
  for (let guard = 0; guard < 3700 && from < to; guard++) {
    if (isWorkDay(new Date(from), cal)) {
      const h = hours(from, cal);
      const open = Math.max(h.open, from), close = Math.min(h.close, to);
      if (close > open) total += Math.floor((close - open) / MINUTES);
    }
    from = nextDay(from, cal);
  }
  if (from < to) throw new Error('SLA interval exceeds the supported calendar horizon');
  return total;
}
export type SlaState = 'met' | 'on_track' | 'at_risk' | 'breached';
export function slaState(dueAt: string | undefined, doneAt: string | undefined, nowMs = Date.now()): SlaState {
  if (doneAt && dueAt) return Date.parse(doneAt) <= Date.parse(dueAt) ? 'met' : 'breached';
  if (!dueAt) return 'on_track';
  const remaining = Date.parse(dueAt) - nowMs;
  return remaining < 0 ? 'breached' : remaining < 4 * 60 * MINUTES ? 'at_risk' : 'on_track';
}
export function addCalendarMonths(iso: string, months: number): string {
  const d = new Date(iso); const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last)); return d.toISOString();
}
export const DAY_MS = DAYS;
