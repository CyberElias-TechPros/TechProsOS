/** Network utilities — real CIDR math for the subnet/VLAN planner tool. */

const ipToInt = (ip: string): number | null => {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let v = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    v = (v << 8) | n;
  }
  return v >>> 0;
};
const intToIp = (v: number): string => [24, 16, 8, 0].map(s => (v >>> s) & 255).join('.');

export interface Subnet {
  cidr: string;
  network: string;
  broadcast: string;
  firstHost: string;
  lastHost: string;
  hosts: number;
  mask: string;
}

export function subnetInfo(cidr: string): Subnet | null {
  const [ipPart, prefixPart] = cidr.split('/');
  const ip = ipToInt(ipPart);
  const prefix = Number(prefixPart);
  if (ip === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const network = (ip & mask) >>> 0;
  const broadcast = (network | (mask ^ 0xffffffff)) >>> 0;
  const size = 2 ** (32 - prefix);
  const hosts = prefix >= 31 ? (prefix === 32 ? 1 : 2) : Math.max(0, size - 2);
  return {
    cidr: `${intToIp(network)}/${prefix}`,
    network: intToIp(network),
    broadcast: intToIp(broadcast),
    firstHost: prefix >= 31 ? intToIp(network) : intToIp((network + 1) >>> 0),
    lastHost: prefix >= 31 ? intToIp(broadcast) : intToIp((broadcast - 1) >>> 0),
    hosts,
    mask: intToIp(mask),
  };
}

/** Split a parent CIDR into `count` equal subnets (prefix lengthened accordingly). */
export function splitSubnets(parentCidr: string, count: number): Subnet[] {
  const parent = subnetInfo(parentCidr);
  if (!parent) return [];
  const [base] = parent.cidr.split('/');
  const prefix = Number(parent.cidr.split('/')[1]);
  const bits = Math.ceil(Math.log2(Math.max(1, count)));
  const childPrefix = prefix + bits;
  if (childPrefix > 32) return [];
  const baseInt = ipToInt(base)!;
  const size = 2 ** (32 - childPrefix);
  const out: Subnet[] = [];
  for (let i = 0; i < 2 ** bits; i++) {
    const net = (baseInt + i * size) >>> 0;
    const info = subnetInfo(`${intToIp(net)}/${childPrefix}`);
    if (info) out.push(info);
  }
  return out;
}

/** Suggested VLAN plan labels for a typical office/campus. */
export function vlanSuggestion(prefix: number): { vlan: number; name: string; note: string }[] {
  return [
    { vlan: 10, name: 'Management', note: 'Device admin interfaces only' },
    { vlan: 20, name: 'Staff', note: 'Employees; full internal access' },
    { vlan: 30, name: 'Voice/AV', note: 'Phones, projectors, smart boards' },
    { vlan: 40, name: prefix <= 24 ? 'Servers' : 'Infrastructure', note: 'Servers, printers, CCTV' },
    { vlan: 50, name: 'Guest', note: 'Internet-only; client isolation on' },
    { vlan: 60, name: 'IoT/OT', note: 'Power meters, access control' },
  ];
}

/** Rough monthly data-burn estimate for common activities (GB). */
export function dataBurnEstimate(opts: { videoHoursPerDay: number; meetingHoursPerDay: number; users: number }): { gbPerMonth: number; note: string } {
  const perUserDaily = opts.videoHoursPerDay * 0.7 + opts.meetingHoursPerDay * 1.1 + 0.4;
  const gb = perUserDaily * opts.users * 30;
  return {
    gbPerMonth: Math.round(gb),
    note: `~${perUserDaily.toFixed(1)} GB per user per day × ${opts.users} users × 30 days. Streaming 480p ≈ 0.7 GB/h, video calls ≈ 1.1 GB/h.`,
  };
}

/** Latency guidance class for the speed-check tool. */
export function latencyClass(ms: number): { label: string; advice: string } {
  if (ms < 40) return { label: 'Excellent', advice: 'Fine for VoIP, remote desktop and real-time collaboration.' };
  if (ms < 100) return { label: 'Good', advice: 'Comfortable for most cloud tools; VoIP is workable.' };
  if (ms < 220) return { label: 'Fair', advice: 'Noticeable on calls; check for congestion or international routing detours.' };
  return { label: 'Poor', advice: 'Likely routing via far-off gateways. Test against a Lagos node and raise it with your ISP.' };
}
