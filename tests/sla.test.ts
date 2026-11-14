import { describe, expect, it } from 'vitest';
import { addBusinessMinutes, businessMinutesBetween, DEFAULT_SLA_TARGETS, priorityFrom, slaState } from '../src/platform/sla';

const cal = { workStartHour: 7, workEndHour: 17, workDays: [1, 2, 3, 4, 5, 6], holidays: ['2026-12-25'] };

describe('priority matrix (README §2)', () => {
  it('maps impact × urgency to priority', () => {
    expect(priorityFrom('high', 'high')).toBe('critical');
    expect(priorityFrom('high', 'low')).toBe('high');
    expect(priorityFrom('medium', 'medium')).toBe('medium');
    expect(priorityFrom('low', 'low')).toBe('low');
  });

  it('README example targets are sane', () => {
    expect(DEFAULT_SLA_TARGETS.critical.response).toBe(15);
    expect(DEFAULT_SLA_TARGETS.low.resolve).toBe(2400);
  });
});

describe('business-hours calendar', () => {
  it('a critical ticket raised Friday evening is due 15 minutes after Monday opening', () => {
    // 2026-11-13 is a Friday; 18:00 UTC is after close (17:00)
    const due = addBusinessMinutes('2026-11-13T18:00:00Z', 15, cal);
    // next work day: Saturday 2026-11-14 at 07:00 UTC (cal includes Sat)
    expect(due).toBe('2026-11-14T07:15:00.000Z');
  });

  it('skips Sundays', () => {
    // Saturday 16:50 + 30 min → 10 min Saturday (17:00 close) + 20 min Monday (sun skipped)
    const due = addBusinessMinutes('2026-11-14T16:50:00Z', 30, cal);
    expect(due).toBe('2026-11-16T07:20:00.000Z');
  });

  it('honours holidays', () => {
    // Thursday 2026-12-24 16:30 + 60min → 30 min Thursday, skip 25th holiday, resume 26th 07:30... but 26th is in cal holidays for greenfield; here only 25th
    const due = addBusinessMinutes('2026-12-24T16:30:00Z', 60, cal);
    expect(due).toBe('2026-12-26T07:30:00.000Z');
  });

  it('elapsed business minutes counts only working time', () => {
    const mins = businessMinutesBetween('2026-11-14T16:00:00Z', '2026-11-16T08:00:00Z', cal);
    expect(mins).toBe(60 + 60); // 1h Saturday + 1h Monday
  });

  it('never goes negative', () => {
    expect(businessMinutesBetween('2026-11-16T08:00:00Z', '2026-11-14T16:00:00Z', cal)).toBe(0);
  });
});

describe('sla state', () => {
  it('met when resolved before deadline', () => {
    expect(slaState('2026-11-13T12:00:00Z', '2026-11-13T10:00:00Z')).toBe('met');
  });
  it('breached when unresolved past deadline', () => {
    expect(slaState('2020-01-01T00:00:00Z', undefined)).toBe('breached');
  });
  it('breached when resolved late', () => {
    expect(slaState('2026-11-13T10:00:00Z', '2026-11-13T11:00:00Z')).toBe('breached');
  });
});
