/**
 * SLA engine — README Module 02: business-hours-aware first-response and
 * resolution targets, plus the impact × urgency priority matrix.
 * Working calendar is evaluated in UTC; the demo tenant pins a Lagos calendar
 * (UTC+1) by storing its hours already shifted, keeping the math timezone-free.
 */
import type { ImpactUrgency, Priority, SlaPolicy } from './types';
import { DAYS, MINUTES } from './util';

/** Priority matrix (impact rows × urgency columns), per README §Module 02. */
export const PRIORITY_MATRIX: Record<ImpactUrgency, Record<ImpactUrgency, Priority>> = {
  high:   { high: 'critical', medium: 'high',   low: 'high' },
  medium: { high: 'high',     medium: 'medium', low: 'medium' },
  low:    { high: 'medium',   medium: 'low',    low: 'low' },
};

export function priorityFrom(impact: ImpactUrgency, urgency: ImpactUrgency): Priority {
  return PRIORITY_MATRIX[impact][urgency];
}

/** README §2 example targets, expressed in business minutes (8-hour workdays). */
export const DEFAULT_SLA_TARGETS: SlaPolicy['targets'] = {
  critical: { response: 15,  resolve: 240 },   // 15 min / 4 hours
  high:     { response: 30,  resolve: 480 },   // 30 min / 8 hours
  medium:   { response: 240, resolve: 960 },   // 4 hours / 2 business days
  low:      { response: 480, resolve: 2400 },  // 8 business hours / 5 business days
};

export type WorkCal = Pick<SlaPolicy, 'workStartHour' | 'workEndHour' | 'workDays' | 'holidays'>;

const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

export function isWorkDay(d: Date, cal: WorkCal): boolean {
  return cal.workDays.includes(d.getUTCDay()) && !cal.holidays.includes(dayKey(d));
}

function workOpen(d: Date, cal: WorkCal): Date {
  const o = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), cal.workStartHour, 0, 0, 0));
  return o;
}
function workClose(d: Date, cal: WorkCal): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), cal.workEndHour, 0, 0, 0));
}

/** First working minute at or after `t`. Clamped to a 370-day search. */
export function nextWorkStart(t: Date, cal: WorkCal): Date {
  let d = new Date(t);
  for (let i = 0; i < 370; i++) {
    if (isWorkDay(d, cal)) {
      const open = workOpen(d, cal);
      const close = workClose(d, cal);
      if (d < open) return open;
      if (d < close) return d;
      // past close: fall through to next day
    }
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0));
  }
  return d;
}

/** Add `businessMinutes` to `fromIso`, counting only working minutes. */
export function addBusinessMinutes(fromIso: string, businessMinutes: number, cal: WorkCal): string {
  let cursor = nextWorkStart(new Date(fromIso), cal);
  let remaining = Math.max(0, businessMinutes);
  for (let guard = 0; guard < 370 && remaining > 0; guard++) {
    const close = workClose(cursor, cal);
    const avail = Math.max(0, Math.floor((close.getTime() - cursor.getTime()) / MINUTES));
    if (avail >= remaining) return new Date(cursor.getTime() + remaining * MINUTES).toISOString();
    remaining -= avail;
    cursor = nextWorkStart(new Date(cursor.getTime() + DAYS), cal);
  }
  return cursor.toISOString();
}

/** Business minutes elapsed between two instants (never negative, bounded to 370 iterations). */
export function businessMinutesBetween(aIso: string, bIso: string, cal: WorkCal): number {
  let from = new Date(aIso).getTime();
  const to = new Date(bIso).getTime();
  if (to <= from) return 0;
  let total = 0;
  for (let guard = 0; guard < 400 && from < to; guard++) {
    const d = new Date(from);
    if (isWorkDay(d, cal)) {
      const open = Math.max(workOpen(d, cal).getTime(), from);
      const close = Math.min(workClose(d, cal).getTime(), to);
      if (close > open) total += Math.floor((close - open) / MINUTES);
    }
    // jump to next midnight UTC (guaranteed progress)
    from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0)).getTime();
  }
  return total;
}

export type SlaState = 'met' | 'on_track' | 'at_risk' | 'breached';

/** State of a deadline: 'met' if completed in time, else relative to now. */
export function slaState(dueAt: string | undefined, doneAt: string | undefined, nowMs = Date.now()): SlaState {
  if (doneAt && dueAt) return new Date(doneAt).getTime() <= new Date(dueAt).getTime() ? 'met' : 'breached';
  if (!dueAt) return 'on_track';
  const remain = new Date(dueAt).getTime() - nowMs;
  if (remain < 0) return 'breached';
  return remain < 4 * 60 * MINUTES ? 'at_risk' : 'on_track';
}
