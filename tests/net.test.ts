import { describe, expect, it } from 'vitest';
import { dataBurnEstimate, splitSubnets, subnetInfo } from '../src/platform/net';

describe('subnet calculator', () => {
  it('analyses a /24', () => {
    const s = subnetInfo('192.168.10.0/24')!;
    expect(s.network).toBe('192.168.10.0');
    expect(s.broadcast).toBe('192.168.10.255');
    expect(s.firstHost).toBe('192.168.10.1');
    expect(s.hosts).toBe(254);
    expect(s.mask).toBe('255.255.255.0');
  });

  it('normalises a host address to its network', () => {
    const s = subnetInfo('10.20.30.40/22')!;
    expect(s.network).toBe('10.20.28.0');
    expect(s.hosts).toBe(1022);
  });

  it('handles /31 and /32 edge cases', () => {
    expect(subnetInfo('10.0.0.0/31')!.hosts).toBe(2);
    expect(subnetInfo('10.0.0.5/32')!.hosts).toBe(1);
  });

  it('rejects invalid input', () => {
    expect(subnetInfo('10.0.0.300/24')).toBeNull();
    expect(subnetInfo('10.0.0.1/33')).toBeNull();
    expect(subnetInfo('hello/24')).toBeNull();
  });

  it('splits a network into equal children', () => {
    const parts = splitSubnets('10.10.0.0/24', 4);
    expect(parts).toHaveLength(4);
    expect(parts[0].network).toBe('10.10.0.0');
    expect(parts[1].network).toBe('10.10.0.64');
    expect(parts[0].cidr).toBe('10.10.0.0/26');
  });

  it('refuses splits that exceed the address space', () => {
    // /30 has 4 addresses; 8 children would need /33 — impossible.
    expect(splitSubnets('10.0.0.0/30', 8)).toHaveLength(0);
    // but 4 children are valid host routes (/32)
    expect(splitSubnets('10.0.0.0/30', 4)).toHaveLength(4);
  });
});

describe('data burn estimator', () => {
  it('scales with users and hours', () => {
    const a = dataBurnEstimate({ videoHoursPerDay: 2, meetingHoursPerDay: 1, users: 10 });
    const b = dataBurnEstimate({ videoHoursPerDay: 2, meetingHoursPerDay: 1, users: 20 });
    expect(b.gbPerMonth).toBe(a.gbPerMonth * 2);
    expect(a.gbPerMonth).toBeGreaterThan(0);
  });
});
