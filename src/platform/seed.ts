/**
 * Deterministic demo dataset — a rich, interconnected slice of Nigerian
 * operations so every module is meaningful on first load.
 * All people and organisations are fictional. Dates are relative to first
 * load so the demo always looks current; randomness is seeded (mulberry32)
 * so the shape of the data is stable.
 *
 * SLA calendars are stored in UTC hours: Lagos business hours
 * 08:00–18:00 WAT are 07:00–17:00 UTC.
 */
import type { DataSet, Ticket, TicketMessage, ImpactUrgency } from './types';
import { addBusinessMinutes, DEFAULT_SLA_TARGETS, priorityFrom } from './sla';
import { DAYS, HOURS, mulberry32 } from './util';

export const DEMO = {
  greenfield: 't_greenfield',
  techpros: 't_techpros',
  stives: 't_stives',
  northgate: 't_northgate',
  lumen: 't_lumen',
};

export const DEMO_USERS = {
  chidera: 'u_chidera', ngozi: 'u_ngozi', emeka: 'u_emeka', amara: 'u_amara',
  tobi: 'u_tobi', femi: 'u_femi', kemi: 'u_kemi',
  adaeze: 'u_adaeze', yusuf: 'u_yusuf', segun: 'u_segun',
  ifeoma: 'u_ifeoma', daniel: 'u_daniel',
};

const now = () => new Date();
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const isoAhead = (ms: number) => new Date(Date.now() + ms).toISOString();

export function buildSeed(): DataSet {
  const rnd = mulberry32(1041976);
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
  const between = (a: number, b: number) => a + rnd() * (b - a);

  // ── Tenants ──────────────────────────────────────────────────────────────
  const tenants: DataSet['tenants'] = [
    { id: DEMO.greenfield, name: 'Greenfield Academy', slug: 'greenfield', type: 'organisation', industry: 'Education', plan: 'professional', status: 'active', city: 'Lagos', createdAt: iso(320 * DAYS), aiAssistCredits: 500 },
    { id: DEMO.techpros, name: 'TechPros Services Ltd', slug: 'techpros', type: 'service_provider', industry: 'IT services', plan: 'msp_growth', status: 'active', city: 'Lagos', createdAt: iso(700 * DAYS), aiAssistCredits: 2000 },
    { id: DEMO.stives, name: 'St. Ives Specialist Hospital', slug: 'st-ives', type: 'organisation', industry: 'Healthcare', plan: 'professional', status: 'active', providerId: DEMO.techpros, city: 'Abuja', createdAt: iso(410 * DAYS), aiAssistCredits: 400 },
    { id: DEMO.northgate, name: 'Northgate Logistics Ltd', slug: 'northgate', type: 'organisation', industry: 'Logistics', plan: 'starter', status: 'active', providerId: DEMO.techpros, city: 'Port Harcourt', createdAt: iso(260 * DAYS), aiAssistCredits: 250 },
    { id: DEMO.lumen, name: 'Lumen Hotels & Suites', slug: 'lumen', type: 'organisation', industry: 'Hospitality', plan: 'business', status: 'active', providerId: DEMO.techpros, city: 'Lagos', createdAt: iso(190 * DAYS), aiAssistCredits: 600 },
  ];

  // ── Users & memberships ──────────────────────────────────────────────────
  const users: DataSet['users'] = [
    { id: DEMO_USERS.chidera, name: 'Chidera Okonkwo', email: 'chidera@greenfield.edu.ng', phone: '08033012145', title: 'Proprietor', status: 'active', createdAt: iso(320 * DAYS) },
    { id: DEMO_USERS.ngozi, name: 'Ngozi Eze', email: 'ngozi.eze@greenfield.edu.ng', phone: '08054477812', title: 'IT Manager', status: 'active', createdAt: iso(318 * DAYS) },
    { id: DEMO_USERS.emeka, name: 'Emeka Obi', email: 'emeka.obi@greenfield.edu.ng', phone: '08061239845', title: 'IT Support Technician', status: 'active', createdAt: iso(300 * DAYS) },
    { id: DEMO_USERS.amara, name: 'Amara Bello', email: 'amara.bello@greenfield.edu.ng', phone: '08109922110', title: 'Network Engineer', status: 'active', createdAt: iso(290 * DAYS) },
    { id: DEMO_USERS.tobi, name: 'Tobi Adeyemi', email: 'tobi.adeyemi@greenfield.edu.ng', phone: '08077162039', title: 'Senior Teacher', status: 'active', createdAt: iso(280 * DAYS) },
    { id: DEMO_USERS.femi, name: 'Femi Alabi', email: 'femi.alabi@greenfield.edu.ng', phone: '08025198764', title: 'Bursar', status: 'active', createdAt: iso(270 * DAYS) },
    { id: DEMO_USERS.kemi, name: 'Kemi Lawal', email: 'kemi.lawal@greenfield.edu.ng', phone: '08134556209', title: 'Admin Officer (Procurement)', status: 'active', createdAt: iso(260 * DAYS) },
    { id: DEMO_USERS.adaeze, name: 'Adaeze Nnamdi', email: 'adaeze@techpros.example', phone: '08091110023', title: 'Service Delivery Manager', status: 'active', createdAt: iso(700 * DAYS) },
    { id: DEMO_USERS.yusuf, name: 'Yusuf Garba', email: 'yusuf@techpros.example', phone: '08078843012', title: 'Field Technician', status: 'active', createdAt: iso(650 * DAYS) },
    { id: DEMO_USERS.segun, name: 'Segun Ajayi', email: 'segun@techpros.example', phone: '08125509871', title: 'Account Manager', status: 'active', createdAt: iso(600 * DAYS) },
    { id: DEMO_USERS.ifeoma, name: 'Ifeoma Nwosu', email: 'ifeoma@stives.ng', phone: '08034455662', title: 'Head of Administration', status: 'active', createdAt: iso(410 * DAYS) },
    { id: DEMO_USERS.daniel, name: 'Daniel Okafor', email: 'daniel@lumenhotels.ng', phone: '08103344657', title: 'General Manager', status: 'active', createdAt: iso(190 * DAYS) },
  ];

  const memberships: DataSet['memberships'] = [
    { userId: DEMO_USERS.chidera, tenantId: DEMO.greenfield, role: 'org_owner', status: 'active' },
    { userId: DEMO_USERS.ngozi, tenantId: DEMO.greenfield, role: 'it_manager', status: 'active' },
    { userId: DEMO_USERS.emeka, tenantId: DEMO.greenfield, role: 'it_technician', status: 'active' },
    { userId: DEMO_USERS.amara, tenantId: DEMO.greenfield, role: 'network_engineer', status: 'active' },
    { userId: DEMO_USERS.tobi, tenantId: DEMO.greenfield, role: 'employee', status: 'active' },
    { userId: DEMO_USERS.femi, tenantId: DEMO.greenfield, role: 'finance_officer', status: 'active' },
    { userId: DEMO_USERS.kemi, tenantId: DEMO.greenfield, role: 'procurement_officer', status: 'active' },
    { userId: DEMO_USERS.adaeze, tenantId: DEMO.techpros, role: 'svc_delivery_manager', status: 'active' },
    { userId: DEMO_USERS.yusuf, tenantId: DEMO.techpros, role: 'field_technician', status: 'active' },
    { userId: DEMO_USERS.segun, tenantId: DEMO.techpros, role: 'account_manager', status: 'active' },
    { userId: DEMO_USERS.ifeoma, tenantId: DEMO.stives, role: 'org_admin', status: 'active' },
    { userId: DEMO_USERS.daniel, tenantId: DEMO.lumen, role: 'org_owner', status: 'active' },
  ];

  const invitations: DataSet['invitations'] = [
    { id: 'inv_1', tenantId: DEMO.greenfield, email: 'bisi.fashola@greenfield.edu.ng', name: 'Bisi Fashola', role: 'it_technician', status: 'pending', createdAt: iso(2 * DAYS) },
  ];

  // ── Branches & departments ───────────────────────────────────────────────
  const branches: DataSet['branches'] = [
    { id: 'b_ikeja', tenantId: DEMO.greenfield, name: 'Ikeja Campus (HQ)', city: 'Lagos', address: '14 Allen Avenue, Ikeja, Lagos', status: 'active' },
    { id: 'b_abuja', tenantId: DEMO.greenfield, name: 'Abuja Campus', city: 'Abuja', address: 'Plot 21, Wuse Zone 5, Abuja', status: 'active' },
    { id: 'b_tp_vi', tenantId: DEMO.techpros, name: 'Victoria Island Office', city: 'Lagos', address: 'Adeola Odeku Street, VI, Lagos', status: 'active' },
    { id: 'b_stives', tenantId: DEMO.stives, name: 'Main Hospital', city: 'Abuja', address: '12 Aminu Kano Crescent, Wuse II, Abuja', status: 'active' },
    { id: 'b_northgate', tenantId: DEMO.northgate, name: 'Trans-Amadi Depot', city: 'Port Harcourt', address: 'Trans-Amadi Industrial Layout, PH', status: 'active' },
    { id: 'b_lumen', tenantId: DEMO.lumen, name: 'Lekki Hotel', city: 'Lagos', address: 'Admiralty Way, Lekki Phase 1, Lagos', status: 'active' },
  ];
  const departments: DataSet['departments'] = [
    { id: 'd_ict', tenantId: DEMO.greenfield, branchId: 'b_ikeja', name: 'ICT', headUserId: DEMO_USERS.ngozi },
    { id: 'd_admin', tenantId: DEMO.greenfield, branchId: 'b_ikeja', name: 'Administration' },
    { id: 'd_bursary', tenantId: DEMO.greenfield, branchId: 'b_ikeja', name: 'Bursary', headUserId: DEMO_USERS.femi },
    { id: 'd_acad', tenantId: DEMO.greenfield, branchId: 'b_ikeja', name: 'Academics' },
    { id: 'd_abuja_acad', tenantId: DEMO.greenfield, branchId: 'b_abuja', name: 'Academics (Abuja)' },
    { id: 'd_ops', tenantId: DEMO.stives, branchId: 'b_stives', name: 'Clinical Operations' },
    { id: 'd_rec', tenantId: DEMO.stives, branchId: 'b_stives', name: 'Records & Front Desk' },
    { id: 'd_tp_delivery', tenantId: DEMO.techpros, branchId: 'b_tp_vi', name: 'Service Delivery', headUserId: DEMO_USERS.adaeze },
  ];

  // ── SLA policies (hours stored in UTC) ───────────────────────────────────
  const cal = { workStartHour: 7, workEndHour: 17, workDays: [1, 2, 3, 4, 5, 6], holidays: ['2026-12-25', '2026-12-26', '2027-01-01'] };
  const slaPolicies: DataSet['slaPolicies'] = [
    { id: 'sla_gf', tenantId: DEMO.greenfield, name: 'Greenfield standard SLA', targets: DEFAULT_SLA_TARGETS, ...cal },
    { id: 'sla_tp', tenantId: DEMO.techpros, name: 'Managed client SLA', targets: DEFAULT_SLA_TARGETS, ...cal },
    { id: 'sla_st', tenantId: DEMO.stives, name: 'St. Ives client SLA', targets: DEFAULT_SLA_TARGETS, ...cal },
    { id: 'sla_ng', tenantId: DEMO.northgate, name: 'Northgate client SLA', targets: DEFAULT_SLA_TARGETS, ...cal },
    { id: 'sla_lm', tenantId: DEMO.lumen, name: 'Lumen client SLA', targets: DEFAULT_SLA_TARGETS, ...cal },
  ];

  // ── Assets ───────────────────────────────────────────────────────────────
  type AssetSeed = [name: string, category: string, mfr: string, model: string, cost: number, ageDays: number, branch: string, assignee?: string, cond?: 'excellent' | 'good' | 'fair' | 'poor', warrantyLost?: boolean];
  const assetSeeds: AssetSeed[] = [
    ['HP ProBook 450 G8 — ICT Office', 'End-user computing', 'HP', 'ProBook 450 G8', 685000, 900, 'b_ikeja', DEMO_USERS.ngozi, 'good'],
    ['HP ProBook 450 G8 — Bursary', 'End-user computing', 'HP', 'ProBook 450 G8', 685000, 900, 'b_ikeja', DEMO_USERS.femi, 'good'],
    ['Lenovo ThinkCentre M70s — Front Office', 'End-user computing', 'Lenovo', 'ThinkCentre M70s', 540000, 1100, 'b_ikeja', undefined, 'fair'],
    ['HP EliteBook 840 G9 — Principal', 'End-user computing', 'HP', 'EliteBook 840 G9', 940000, 400, 'b_ikeja', DEMO_USERS.chidera, 'excellent'],
    ['Dell OptiPlex 3000 Lab 01', 'End-user computing', 'Dell', 'OptiPlex 3000', 610000, 500, 'b_ikeja', undefined, 'good'],
    ['Dell OptiPlex 3000 Lab 02', 'End-user computing', 'Dell', 'OptiPlex 3000', 610000, 500, 'b_ikeja', undefined, 'good'],
    ['Dell OptiPlex 3000 Lab 03', 'End-user computing', 'Dell', 'OptiPlex 3000', 610000, 500, 'b_ikeja', undefined, 'poor'],
    ['Dell OptiPlex 3000 Lab 04', 'End-user computing', 'Dell', 'OptiPlex 3000', 610000, 500, 'b_ikeja', undefined, 'good'],
    ['HP LaserJet Pro M404dn — Admin', 'Printers & imaging', 'HP', 'LaserJet Pro M404dn', 385000, 700, 'b_ikeja', undefined, 'good'],
    ['Canon imageRUNNER 2425 — Records', 'Printers & imaging', 'Canon', 'imageRUNNER 2425', 1450000, 820, 'b_ikeja', undefined, 'fair'],
    ['Epson EB-X06 Projector — Hall A', 'AV & smart classroom', 'Epson', 'EB-X06', 510000, 340, 'b_ikeja', undefined, 'excellent'],
    ['Smart Board 65" — JS3', 'AV & smart classroom', 'Smart', 'SBID-MX265', 2350000, 200, 'b_ikeja', undefined, 'excellent'],
    ['Dell PowerEdge T350 — File & ERP server', 'Servers', 'Dell', 'PowerEdge T350', 7850000, 620, 'b_ikeja', undefined, 'good'],
    ['APC Smart-UPS 3kVA — Server room', 'Power & UPS', 'APC', 'SMT3000C', 2350000, 389, 'b_ikeja', undefined, 'good'],
    ['Lister Petter 20kVA generator', 'Power & UPS', 'Lister Petter', 'LP20', 9800000, 1300, 'b_ikeja', undefined, 'fair'],
    ['MikroTik RB4011 — Core router', 'Network', 'MikroTik', 'RB4011iGS+RM', 690000, 620, 'b_ikeja', undefined, 'good'],
    ['Cisco CBS350 — Core switch', 'Network', 'Cisco', 'CBS350-24T', 1250000, 620, 'b_ikeja', undefined, 'excellent'],
    ['Ubiquiti UniFi 6 AP — Admin block', 'Network', 'Ubiquiti', 'U6-Lite', 185000, 400, 'b_ikeja', undefined, 'good'],
    ['Ubiquiti UniFi 6 AP — Science block', 'Network', 'Ubiquiti', 'U6-Lite', 185000, 400, 'b_ikeja', undefined, 'good'],
    ['Ubiquiti UniFi 6 AP — Hostel', 'Network', 'Ubiquiti', 'U6-Lite', 185000, 400, 'b_ikeja', undefined, 'fair'],
    ['Hikvision 16ch DVR + 12 cameras', 'Security systems', 'Hikvision', 'DS-7216HGHI', 1980000, 560, 'b_ikeja', undefined, 'good'],
    ['HP ProBook 450 G9 — Abuja ICT', 'End-user computing', 'HP', 'ProBook 450 G9', 720000, 210, 'b_abuja', DEMO_USERS.tobi, 'excellent'],
    ['Epson EB-S41 Projector — Abuja hall', 'AV & smart classroom', 'Epson', 'EB-S41', 460000, 800, 'b_abuja', undefined, 'fair'],
    ['TP-Link SG1024 — Abuja access switch', 'Network', 'TP-Link', 'SG1024', 165000, 210, 'b_abuja', undefined, 'good'],
    ['APC Back-UPS 1.5kVA — Abuja', 'Power & UPS', 'APC', 'BX1500M', 390000, 210, 'b_abuja', undefined, 'good'],
  ];
  const assets: DataSet['assets'] = assetSeeds.map((s, i) => {
    const [name, category, mfr, model, cost, ageDays, branchId, assigneeId, cond = 'good'] = s;
    const purchaseDate = iso(ageDays * DAYS).slice(0, 10);
    const warrantyYears = category === 'End-user computing' ? 1 : 2;
    return {
      id: `a_${i + 1}`, tenantId: DEMO.greenfield, tag: `TP-${1001 + i}`, name, category,
      manufacturer: mfr, model, serial: `${mfr.slice(0, 2).toUpperCase()}${String(100000 + Math.floor(rnd() * 899999))}`,
      branchId, departmentId: branchId === 'b_abuja' ? 'd_abuja_acad' : category === 'End-user computing' ? 'd_ict' : 'd_admin',
      assigneeId, purchaseDate, purchaseCost: cost,
      usefulLifeYears: category === 'Network' || category === 'Servers' ? 5 : 4,
      warrantyExpiry: new Date(new Date(purchaseDate).getTime() + warrantyYears * 365.25 * DAYS).toISOString().slice(0, 10),
      lifecycle: 'in_service' as const, condition: cond, createdAt: iso(ageDays * DAYS),
    };
  });

  // ── Devices & topology (Greenfield, monitored) ───────────────────────────
  const devices: DataSet['devices'] = [
    { id: 'dev_wan', tenantId: DEMO.greenfield, name: 'Fibre link — MainOne ISP', kind: 'wan', model: '100 Mbps DIA', ip: '197.210.8.14', branchId: 'b_ikeja', monitored: true, status: 'up', latencyMs: 18, packetLossPct: 0, lastSeenAt: now().toISOString() },
    { id: 'dev_fw', tenantId: DEMO.greenfield, name: 'Sophos XGS 136 firewall', kind: 'firewall', model: 'XGS 136', ip: '10.10.0.1', branchId: 'b_ikeja', parentId: 'dev_wan', monitored: true, status: 'up', latencyMs: 2, packetLossPct: 0, cpuPct: 34, memPct: 51, lastSeenAt: now().toISOString() },
    { id: 'dev_core', tenantId: DEMO.greenfield, name: 'CBS350 core switch', kind: 'switch', model: 'CBS350-24T', ip: '10.10.0.2', branchId: 'b_ikeja', parentId: 'dev_fw', monitored: true, status: 'up', latencyMs: 1, packetLossPct: 0, cpuPct: 22, memPct: 40, lastSeenAt: now().toISOString() },
    { id: 'dev_srv', tenantId: DEMO.greenfield, name: 'PowerEdge T350 server', kind: 'server', model: 'T350', ip: '10.10.0.10', branchId: 'b_ikeja', parentId: 'dev_core', monitored: true, status: 'degraded', latencyMs: 3, packetLossPct: 0, cpuPct: 71, memPct: 89, storagePct: 92, lastSeenAt: now().toISOString() },
    { id: 'dev_ap1', tenantId: DEMO.greenfield, name: 'UniFi AP — Admin block', kind: 'ap', model: 'U6-Lite', ip: '10.10.3.11', branchId: 'b_ikeja', parentId: 'dev_core', monitored: true, status: 'up', latencyMs: 4, packetLossPct: 0, lastSeenAt: now().toISOString() },
    { id: 'dev_ap2', tenantId: DEMO.greenfield, name: 'UniFi AP — Science block', kind: 'ap', model: 'U6-Lite', ip: '10.10.3.12', branchId: 'b_ikeja', parentId: 'dev_core', monitored: true, status: 'up', latencyMs: 6, packetLossPct: 2, lastSeenAt: now().toISOString() },
    { id: 'dev_ap3', tenantId: DEMO.greenfield, name: 'UniFi AP — Hostel', kind: 'ap', model: 'U6-Lite', ip: '10.10.3.13', branchId: 'b_ikeja', parentId: 'dev_core', monitored: true, status: 'degraded', latencyMs: 44, packetLossPct: 7, lastSeenAt: now().toISOString() },
    { id: 'dev_ups', tenantId: DEMO.greenfield, name: 'APC Smart-UPS 3kVA', kind: 'ups', model: 'SMT3000C', ip: '10.10.0.20', branchId: 'b_ikeja', parentId: 'dev_core', monitored: true, status: 'up', latencyMs: 2, packetLossPct: 0, lastSeenAt: now().toISOString() },
    { id: 'dev_abj', tenantId: DEMO.greenfield, name: 'Abuja site VPN gateway', kind: 'router', model: 'hEX S', ip: '10.10.4.1', branchId: 'b_abuja', parentId: 'dev_wan', monitored: true, status: 'up', latencyMs: 31, packetLossPct: 1, lastSeenAt: now().toISOString() },
  ];

  // ── Tickets & messages ───────────────────────────────────────────────────
  const ticketTitles: [string, string, ImpactUrgency, ImpactUrgency][] = [
    ['Lab 3 PC stuck on boot logo', 'Hardware', 'medium', 'high'],
    ['Staff Wi-Fi drops every afternoon', 'Network & connectivity', 'high', 'high'],
    ['New teacher needs email and portal accounts', 'Software & accounts', 'low', 'medium'],
    ['Admin printer shows faded prints', 'Printing', 'low', 'low'],
    ['Projector in Hall A shows no signal', 'AV & classroom', 'medium', 'medium'],
    ['Suspicious invoice email received by bursary', 'Security', 'high', 'high'],
    ['UPS alarm beeping in server room', 'Power & UPS', 'medium', 'high'],
    ['Shared drive slow to open files', 'Software & accounts', 'medium', 'medium'],
    ['Request: install smart-notebook software', 'Software & accounts', 'low', 'low'],
    ['Hostel AP unreachable — students offline', 'Network & connectivity', 'high', 'high'],
    ['Bursary PC cannot print to LaserJet', 'Printing', 'medium', 'medium'],
    ['VPN to Abuja campus unstable', 'Network & connectivity', 'high', 'medium'],
    ['Laptop battery swelling — bursary unit', 'Hardware', 'high', 'high'],
    ['Reset portal password (exam officer)', 'Software & accounts', 'low', 'high'],
    ['ERP throws licence expiry warning', 'Software & accounts', 'high', 'medium'],
    ['Camera 7 offline at main gate', 'Security', 'medium', 'medium'],
    ['Request: projector lamp replacement', 'AV & classroom', 'low', 'medium'],
    ['Internet throttled during online exams', 'Network & connectivity', 'high', 'high'],
    ['Smart board touch not responding (JS3)', 'AV & classroom', 'medium', 'medium'],
    ['New staff onboarding — 3 laptops setup', 'Hardware', 'medium', 'low'],
    ['Dust buildup causing server fans to run loud', 'Hardware', 'medium', 'medium'],
    ['Email delivery delays with parents’ Gmail', 'Email & collaboration', 'medium', 'low'],
    ['Possible malware pop-up on records PC', 'Security', 'high', 'high'],
    ['Request toner for Canon imageRUNNER', 'Printing', 'low', 'medium'],
    ['Classroom PC audio jack broken', 'Hardware', 'low', 'low'],
    ['Diesel generator fails auto-start test', 'Power & UPS', 'high', 'high'],
  ];
  const statuses: Ticket['status'][] = [
    'closed', 'closed', 'closed', 'resolved', 'closed', 'resolved', 'closed', 'closed',
    'in_progress', 'assigned', 'pending', 'in_progress', 'closed', 'closed', 'resolved',
    'in_progress', 'pending', 'closed', 'closed', 'new', 'triaged', 'assigned', 'in_progress',
    'closed', 'resolved', 'new',
  ];
  const gfUsers = [DEMO_USERS.ngozi, DEMO_USERS.emeka, DEMO_USERS.amara];
  const requesters = [DEMO_USERS.tobi, DEMO_USERS.femi, DEMO_USERS.kemi, DEMO_USERS.ngozi, DEMO_USERS.emeka];

  const tickets: Ticket[] = [];
  const ticketMessages: TicketMessage[] = [];
  for (let i = 0; i < ticketTitles.length; i++) {
    const [title, category, impact, urgency] = ticketTitles[i];
    const ageDays = Math.round(between(1, 55));
    const createdAt = iso(ageDays * DAYS + between(0, 8) * HOURS);
    const priority = priorityFrom(impact, urgency);
    const t = DEFAULT_SLA_TARGETS[priority];
    const status = statuses[i];
    const requesterId = requesters[i % requesters.length];
    const assigneeId = status === 'new' || status === 'triaged' ? (status === 'triaged' ? DEMO_USERS.ngozi : undefined) : pick(gfUsers);
    const responded = status !== 'new' && status !== 'triaged';
    const resolved = status === 'resolved' || status === 'closed';
    const firstResponseAt = responded ? iso(Math.max(0, ageDays - between(0.1, 0.6)) * DAYS) : undefined;
    const resolvedAt = resolved ? iso(Math.max(0, ageDays - between(0.5, 2)) * DAYS) : undefined;
    const closedAt = status === 'closed' ? iso(Math.max(0, ageDays - between(1, 2.5)) * DAYS) : undefined;
    const responses = ['Replaced the thermal paste and reseated the RAM — POSTs cleanly now.',
      'Re-terminated the uplink jack at the distribution frame; link stable for 24h.',
      'Created the accounts and sent credentials by official memo.',
      'Cleaned the fuser and fitted a remanufactured cartridge pending PO.',
      'Swapped the HDMI run for a tested cable; signal solid.',
      'Confirmed as phishing; headers logged, sender blocked at the firewall.'];
    tickets.push({
      id: `tk_${100 + i}`, tenantId: DEMO.greenfield, number: `TKT-${1001 + i}`,
      kind: i % 6 === 2 || i % 9 === 8 ? 'request' : i === 25 ? 'change' : i === 16 ? 'problem' : 'incident',
      title, description: `${title}. Reported via ${pick(['portal', 'email', 'phone']) as string} by ${users.find(u => u.id === requesterId)?.name}.`,
      category, requesterId, assigneeId,
      branchId: i % 5 === 4 ? 'b_abuja' : 'b_ikeja',
      departmentId: i % 3 === 0 ? 'd_ict' : i % 3 === 1 ? 'd_acad' : 'd_bursary',
      assetId: category === 'Hardware' && i < 18 ? `a_${(i % 8) + 1}` : undefined,
      impact, urgency, priority, priorityOverridden: false,
      status, slaPolicyId: 'sla_gf',
      responseDueAt: addBusinessMinutes(createdAt, t.response, cal),
      resolveDueAt: addBusinessMinutes(createdAt, t.resolve, cal),
      firstResponseAt, resolvedAt, closedAt,
      resolutionSummary: resolved ? responses[i % responses.length] : undefined,
      csat: status === 'closed' ? (i % 7 === 0 ? 4 : 5) : undefined,
      source: i % 4 === 0 ? 'email' : i % 5 === 0 ? 'phone' : 'portal',
      createdAt, updatedAt: closedAt ?? resolvedAt ?? firstResponseAt ?? createdAt,
    });
    if (i % 2 === 0 && status !== 'new') {
      ticketMessages.push({
        id: `msg_${i}_1`, tenantId: DEMO.greenfield, ticketId: `tk_${100 + i}`, authorId: DEMO_USERS.ngozi,
        body: 'Looking into this now — will update before close of business.', internal: false, createdAt: firstResponseAt ?? createdAt,
      });
      ticketMessages.push({
        id: `msg_${i}_2`, tenantId: DEMO.greenfield, ticketId: `tk_${100 + i}`, authorId: assigneeId ?? DEMO_USERS.emeka,
        body: 'Internal: checked logs; likely upstream. Monitoring.', internal: true, createdAt: firstResponseAt ?? createdAt,
      });
    }
  }
  // Monitoring-sourced incident linked to the degraded server
  tickets.unshift({
    id: 'tk_mon_1', tenantId: DEMO.greenfield, number: 'TKT-1030', kind: 'incident',
    title: 'Server storage above 90% utilisation', description: 'Monitoring flagged PowerEdge T350 storage at 92%. Risk of outage for ERP and file shares.',
    category: 'Hardware', requesterId: DEMO_USERS.ngozi, assigneeId: DEMO_USERS.emeka, branchId: 'b_ikeja', departmentId: 'd_ict',
    assetId: 'a_13', impact: 'high', urgency: 'medium', priority: 'high', priorityOverridden: false,
    status: 'in_progress', slaPolicyId: 'sla_gf',
    responseDueAt: addBusinessMinutes(iso(1 * DAYS), 30, cal), resolveDueAt: addBusinessMinutes(iso(1 * DAYS), 480, cal),
    firstResponseAt: iso(0.8 * DAYS), source: 'monitoring', createdAt: iso(1 * DAYS), updatedAt: iso(3 * HOURS),
  });
  // Client tickets for the provider (St. Ives + Lumen)
  const clientTickets: Ticket[] = [
    {
      id: 'tk_st_1', tenantId: DEMO.stives, number: 'TKT-1007', kind: 'incident',
      title: 'Records department cannot reach the EMR', description: 'Front desk and records unit report the EMR portal timing out since 07:40.',
      category: 'Software & accounts', requesterId: DEMO_USERS.ifeoma, assigneeId: DEMO_USERS.yusuf, branchId: 'b_stives', departmentId: 'd_rec',
      impact: 'high', urgency: 'high', priority: 'critical', priorityOverridden: false, status: 'in_progress', slaPolicyId: 'sla_st',
      responseDueAt: addBusinessMinutes(iso(2 * HOURS), 15, cal), resolveDueAt: addBusinessMinutes(iso(2 * HOURS), 240, cal),
      firstResponseAt: iso(1.7 * HOURS), source: 'portal', createdAt: iso(2 * HOURS), updatedAt: iso(0.5 * HOURS),
    },
    {
      id: 'tk_st_2', tenantId: DEMO.stives, number: 'TKT-1006', kind: 'request',
      title: 'Two additional workstations for the lab annex', description: 'Lab annex opens next week; two configured workstations with barcode printers required.',
      category: 'Hardware', requesterId: DEMO_USERS.ifeoma, assigneeId: DEMO_USERS.yusuf, branchId: 'b_stives', departmentId: 'd_ops',
      impact: 'medium', urgency: 'medium', priority: 'medium', priorityOverridden: false, status: 'resolved', slaPolicyId: 'sla_st',
      responseDueAt: addBusinessMinutes(iso(5 * DAYS), 240, cal), resolveDueAt: addBusinessMinutes(iso(5 * DAYS), 960, cal),
      firstResponseAt: iso(4.8 * DAYS), resolvedAt: iso(0.4 * DAYS), resolutionSummary: 'Staged and delivered two workstations with lab image v3; barcode printers calibrated.',
      source: 'email', createdAt: iso(5 * DAYS), updatedAt: iso(0.3 * DAYS),
    },
    {
      id: 'tk_lm_1', tenantId: DEMO.lumen, number: 'TKT-1012', kind: 'incident',
      title: 'Guest Wi-Fi complaints on floors 3–5', description: 'Guests report captive portal loops. Front desk escalated after three complaints in one evening.',
      category: 'Network & connectivity', requesterId: DEMO_USERS.daniel, assigneeId: DEMO_USERS.yusuf, branchId: 'b_lumen',
      impact: 'high', urgency: 'medium', priority: 'high', priorityOverridden: false, status: 'assigned', slaPolicyId: 'sla_lm',
      responseDueAt: addBusinessMinutes(iso(1 * DAYS), 30, cal), resolveDueAt: addBusinessMinutes(iso(1 * DAYS), 480, cal),
      firstResponseAt: iso(0.9 * DAYS), source: 'phone', createdAt: iso(1 * DAYS), updatedAt: iso(20 * HOURS),
    },
    {
      id: 'tk_ng_1', tenantId: DEMO.northgate, number: 'TKT-1004', kind: 'incident',
      title: 'Dispatch PCs lose drives after power surge', description: 'Two dispatch desktops fail to boot after the generator changeover surge.',
      category: 'Power & UPS', requesterId: DEMO_USERS.daniel, branchId: 'b_northgate',
      impact: 'high', urgency: 'high', priority: 'critical', priorityOverridden: false, status: 'closed', slaPolicyId: 'sla_ng',
      responseDueAt: addBusinessMinutes(iso(9 * DAYS), 15, cal), resolveDueAt: addBusinessMinutes(iso(9 * DAYS), 240, cal),
      firstResponseAt: iso(8.9 * DAYS), resolvedAt: iso(8.2 * DAYS), closedAt: iso(8 * DAYS),
      resolutionSummary: 'Replaced two PSUs and fitted surge protection boards on the dispatch bench.',
      csat: 5, source: 'portal', createdAt: iso(9 * DAYS), updatedAt: iso(8 * DAYS),
    },
  ];
  tickets.push(...clientTickets);

  // ── Alerts ───────────────────────────────────────────────────────────────
  const alerts: DataSet['alerts'] = [
    { id: 'al_1', tenantId: DEMO.greenfield, deviceId: 'dev_srv', severity: 'warning', message: 'PowerEdge T350 storage at 92% — capacity planning required', status: 'acknowledged', incidentId: 'tk_mon_1', createdAt: iso(1 * DAYS), ackAt: iso(20 * HOURS) },
    { id: 'al_2', tenantId: DEMO.greenfield, deviceId: 'dev_ap3', severity: 'warning', message: 'UniFi AP — Hostel latency 44ms, packet loss 7%', status: 'active', createdAt: iso(5 * HOURS) },
    { id: 'al_3', tenantId: DEMO.greenfield, deviceId: 'dev_ap2', severity: 'info', message: 'UniFi AP — Science block firmware update available (7.1.26)', status: 'active', createdAt: iso(2 * DAYS) },
    { id: 'al_4', tenantId: DEMO.greenfield, deviceId: 'dev_wan', severity: 'critical', message: 'Fibre link flapped 3 times between 02:11 and 02:26', status: 'resolved', createdAt: iso(6 * DAYS), resolvedAt: iso(5.9 * DAYS) },
  ];

  // ── Maintenance ──────────────────────────────────────────────────────────
  const maintenancePlans: DataSet['maintenancePlans'] = [
    { id: 'mp_1', tenantId: DEMO.greenfield, name: 'Computer lab monthly servicing', assetCategory: 'End-user computing', intervalMonths: 1, assigneeId: DEMO_USERS.emeka, active: true, nextRunAt: isoAhead(4 * DAYS), checklist: ['Dust filters cleaned', 'OS & security updates applied', 'Disk health checked', 'Peripherals tested', 'Firmware/BIOS reviewed'] },
    { id: 'mp_2', tenantId: DEMO.greenfield, name: 'Network equipment quarterly healthcheck', assetCategory: 'Network', intervalMonths: 3, assigneeId: DEMO_USERS.amara, active: true, nextRunAt: isoAhead(21 * DAYS), checklist: ['Firmware reviewed', 'Config backup exported', 'Cable & optics inspected', 'Throughput baseline captured'] },
    { id: 'mp_3', tenantId: DEMO.greenfield, name: 'Power systems monthly inspection', assetCategory: 'Power & UPS', intervalMonths: 1, assigneeId: DEMO_USERS.emeka, active: true, nextRunAt: iso(2 * DAYS), checklist: ['Generator oil & coolant', 'ATS auto-start test', 'UPS battery health', 'Fuel log reconciled'] },
  ];
  const workOrders: DataSet['workOrders'] = [
    { id: 'wo_1', tenantId: DEMO.greenfield, number: 'WO-1031', title: 'Power systems monthly inspection — APC Smart-UPS 3kVA', kind: 'preventive', planId: 'mp_3', assetId: 'a_14', branchId: 'b_ikeja', assigneeId: DEMO_USERS.emeka, status: 'in_progress', dueAt: isoAhead(1 * DAYS), checklist: maintenancePlans[2].checklist.map((item, i) => ({ item, done: i < 2 })), createdAt: iso(2 * DAYS) },
    { id: 'wo_2', tenantId: DEMO.greenfield, number: 'WO-1030', title: 'Computer lab monthly servicing — Dell OptiPlex 3000 Lab 01', kind: 'preventive', planId: 'mp_1', assetId: 'a_5', branchId: 'b_ikeja', assigneeId: DEMO_USERS.emeka, status: 'completed', dueAt: iso(5 * DAYS), completedAt: iso(6 * DAYS), checklist: maintenancePlans[0].checklist.map(item => ({ item, done: true })), labourHours: 2.5, cost: 0, signOffBy: DEMO_USERS.ngozi, createdAt: iso(9 * DAYS), notes: 'All units passed; lab units re-imaged with the November build.' },
    { id: 'wo_3', tenantId: DEMO.greenfield, number: 'WO-1032', title: 'Replace swollen battery — HP ProBook Bursary', kind: 'corrective', assetId: 'a_2', branchId: 'b_ikeja', assigneeId: DEMO_USERS.emeka, status: 'scheduled', dueAt: isoAhead(2 * DAYS), checklist: [{ item: 'Source battery (Zinox order)', done: true }, { item: 'Replace & calibrate', done: false }, { item: 'Health check discharge cycle', done: false }], createdAt: iso(1 * DAYS) },
    { id: 'wo_4', tenantId: DEMO.stives, number: 'WO-1040', title: 'Quarterly network healthcheck — Main Hospital', kind: 'preventive', branchId: 'b_stives', assigneeId: DEMO_USERS.yusuf, status: 'open', dueAt: isoAhead(6 * DAYS), checklist: maintenancePlans[1].checklist.map(item => ({ item, done: false })), createdAt: iso(1 * DAYS) },
    { id: 'wo_5', tenantId: DEMO.greenfield, number: 'WO-1029', title: 'Computer lab monthly servicing — Dell OptiPlex Lab 02–04', kind: 'preventive', planId: 'mp_1', branchId: 'b_ikeja', assigneeId: DEMO_USERS.emeka, status: 'completed', dueAt: iso(12 * DAYS), completedAt: iso(13 * DAYS), checklist: maintenancePlans[0].checklist.map(item => ({ item, done: true })), labourHours: 6, createdAt: iso(15 * DAYS) },
  ];

  // ── Projects ─────────────────────────────────────────────────────────────
  const projects: DataSet['projects'] = [
    {
      id: 'pr_1', tenantId: DEMO.greenfield, name: 'Abuja campus Wi-Fi rollout', kind: 'Network deployment', status: 'in_progress',
      managerId: DEMO_USERS.amara, branchId: 'b_abuja', budget: 4850000, spent: 3120000,
      startAt: iso(38 * DAYS), dueAt: isoAhead(17 * DAYS),
      milestones: [
        { id: 'ms_1', title: 'Site survey & heat-map', dueAt: iso(30 * DAYS), done: true },
        { id: 'ms_2', title: 'Procure access layer (6× U6-LR)', dueAt: iso(14 * DAYS), done: true },
        { id: 'ms_3', title: 'Cabling & mounting', dueAt: isoAhead(4 * DAYS), done: false },
        { id: 'ms_4', title: 'Controller config & VLANs', dueAt: isoAhead(11 * DAYS), done: false },
        { id: 'ms_5', title: 'UAT & handover', dueAt: isoAhead(17 * DAYS), done: false },
      ],
      description: 'Blanket Wi-Fi 6 coverage for the Abuja campus: classrooms, staff room and admin offices, with a dedicated student VLAN and content filtering.',
      createdAt: iso(40 * DAYS),
    },
    {
      id: 'pr_2', tenantId: DEMO.greenfield, name: 'CCTV expansion — perimeter & hallways', kind: 'Security installation', status: 'planning',
      managerId: DEMO_USERS.ngozi, branchId: 'b_ikeja', budget: 6200000, spent: 0,
      startAt: iso(8 * DAYS), dueAt: isoAhead(52 * DAYS),
      milestones: [
        { id: 'ms_6', title: 'Camera layout design', dueAt: isoAhead(6 * DAYS), done: false },
        { id: 'ms_7', title: 'Vendor quotes received', dueAt: isoAhead(14 * DAYS), done: false },
        { id: 'ms_8', title: 'Installation', dueAt: isoAhead(38 * DAYS), done: false },
        { id: 'ms_9', title: 'Handover & training', dueAt: isoAhead(52 * DAYS), done: false },
      ],
      description: 'Extend coverage from 12 to 28 cameras, add ANPR at the main gate, and centralise retention on a new NVR with 30-day storage.',
      createdAt: iso(9 * DAYS),
    },
    {
      id: 'pr_3', tenantId: DEMO.greenfield, name: 'Computer lab refresh (24 units)', kind: 'Hardware refresh', status: 'completed',
      managerId: DEMO_USERS.emeka, branchId: 'b_ikeja', budget: 15200000, spent: 14640000,
      startAt: iso(210 * DAYS), dueAt: iso(152 * DAYS),
      milestones: [
        { id: 'ms_10', title: 'Needs assessment', dueAt: iso(200 * DAYS), done: true },
        { id: 'ms_11', title: 'Procurement', dueAt: iso(180 * DAYS), done: true },
        { id: 'ms_12', title: 'Imaging & deployment', dueAt: iso(160 * DAYS), done: true },
        { id: 'ms_13', title: 'Handover', dueAt: iso(152 * DAYS), done: true },
      ],
      description: 'Replaced the ageing lab fleet with 24 Dell OptiPlex 3000 units, standard image with exam lockdown mode.',
      createdAt: iso(215 * DAYS),
    },
    {
      id: 'pr_4', tenantId: DEMO.techpros, clientTenantId: DEMO.stives, name: 'Hospital LAN redesign', kind: 'Network deployment', status: 'in_progress',
      managerId: DEMO_USERS.yusuf, budget: 9800000, spent: 2400000,
      startAt: iso(22 * DAYS), dueAt: isoAhead(26 * DAYS),
      milestones: [
        { id: 'ms_14', title: 'Current-state assessment', dueAt: iso(15 * DAYS), done: true },
        { id: 'ms_15', title: 'Design & sign-off', dueAt: iso(3 * DAYS), done: true },
        { id: 'ms_16', title: 'Core replacement window', dueAt: isoAhead(9 * DAYS), done: false },
        { id: 'ms_17', title: 'Ward-by-ward migration', dueAt: isoAhead(21 * DAYS), done: false },
      ],
      description: 'Segment clinical and guest traffic, replace the ageing core, and document the new topology for the records office.',
      createdAt: iso(24 * DAYS),
    },
  ];
  const tasks: DataSet['tasks'] = [
    { id: 'task_1', tenantId: DEMO.greenfield, projectId: 'pr_1', title: 'Pull CAT6 to block C classrooms', column: 'doing', assigneeId: DEMO_USERS.amara, priority: 'high', dueAt: isoAhead(2 * DAYS), createdAt: iso(20 * DAYS) },
    { id: 'task_2', tenantId: DEMO.greenfield, projectId: 'pr_1', title: 'Mount APs — admin wing', column: 'todo', assigneeId: DEMO_USERS.emeka, priority: 'medium', dueAt: isoAhead(5 * DAYS), createdAt: iso(18 * DAYS) },
    { id: 'task_3', tenantId: DEMO.greenfield, projectId: 'pr_1', title: 'Configure student VLAN + filtering profile', column: 'todo', assigneeId: DEMO_USERS.amara, priority: 'high', dueAt: isoAhead(9 * DAYS), createdAt: iso(17 * DAYS) },
    { id: 'task_4', tenantId: DEMO.greenfield, projectId: 'pr_1', title: 'Label & test all daughter sockets', column: 'review', assigneeId: DEMO_USERS.emeka, priority: 'medium', dueAt: isoAhead(1 * DAYS), createdAt: iso(15 * DAYS) },
    { id: 'task_5', tenantId: DEMO.greenfield, projectId: 'pr_1', title: 'Site survey report signed', column: 'done', assigneeId: DEMO_USERS.amara, priority: 'medium', createdAt: iso(30 * DAYS) },
    { id: 'task_6', tenantId: DEMO.greenfield, projectId: 'pr_2', title: 'Draft camera placement map v1', column: 'doing', assigneeId: DEMO_USERS.ngozi, priority: 'medium', createdAt: iso(6 * DAYS) },
    { id: 'task_7', tenantId: DEMO.greenfield, projectId: 'pr_2', title: 'RFQ to 3 vendors', column: 'todo', assigneeId: DEMO_USERS.kemi, priority: 'medium', createdAt: iso(5 * DAYS) },
    { id: 'task_8', tenantId: DEMO.techpros, projectId: 'pr_4', title: 'Stage replacement core switch', column: 'doing', assigneeId: DEMO_USERS.yusuf, priority: 'high', dueAt: isoAhead(3 * DAYS), createdAt: iso(10 * DAYS) },
    { id: 'task_9', tenantId: DEMO.techpros, projectId: 'pr_4', title: 'Write rollback plan', column: 'review', assigneeId: DEMO_USERS.adaeze, priority: 'high', dueAt: isoAhead(2 * DAYS), createdAt: iso(8 * DAYS) },
    { id: 'task_10', tenantId: DEMO.techpros, projectId: 'pr_4', title: 'Baseline ward Wi-Fi coverage', column: 'done', assigneeId: DEMO_USERS.yusuf, priority: 'medium', createdAt: iso(15 * DAYS) },
  ];

  // ── Client records (provider) ────────────────────────────────────────────
  const agreements: DataSet['agreements'] = [
    { id: 'agr_1', tenantId: DEMO.techpros, clientTenantId: DEMO.stives, name: 'Managed IT services — hospital', tier: 'Managed', monthlyFee: 350000, startsAt: iso(410 * DAYS), renewsAt: isoAhead(320 * DAYS), status: 'active' },
    { id: 'agr_2', tenantId: DEMO.techpros, clientTenantId: DEMO.northgate, name: 'Essential support retainer', tier: 'Essential', monthlyFee: 180000, startsAt: iso(260 * DAYS), renewsAt: isoAhead(24 * DAYS), status: 'expiring' },
    { id: 'agr_3', tenantId: DEMO.techpros, clientTenantId: DEMO.lumen, name: 'Premium hospitality IT ops', tier: 'Premium', monthlyFee: 620000, startsAt: iso(190 * DAYS), renewsAt: isoAhead(176 * DAYS), status: 'active' },
  ];
  const contacts: DataSet['contacts'] = [
    { id: 'ct_1', tenantId: DEMO.techpros, clientTenantId: DEMO.stives, name: 'Ifeoma Nwosu', role: 'Head of Administration', email: 'ifeoma@stives.ng', phone: '08034455662', primary: true },
    { id: 'ct_2', tenantId: DEMO.techpros, clientTenantId: DEMO.stives, name: 'Dr. Bassey Udoh', role: 'Medical Director', email: 'budoh@stives.ng', phone: '08097712344', primary: false },
    { id: 'ct_3', tenantId: DEMO.techpros, clientTenantId: DEMO.northgate, name: 'Rotimi Falana', role: 'Operations Manager', email: 'rotimi@northgate.ng', phone: '08062334110', primary: true },
    { id: 'ct_4', tenantId: DEMO.techpros, clientTenantId: DEMO.lumen, name: 'Daniel Okafor', role: 'General Manager', email: 'daniel@lumenhotels.ng', phone: '08103344657', primary: true },
  ];

  // ── Procurement ──────────────────────────────────────────────────────────
  const vendors: DataSet['vendors'] = [
    { id: 'v_1', tenantId: DEMO.greenfield, name: 'Mainline Systems Ltd', category: 'Hardware', contact: 'Uche Balogun', phone: '08023344551', email: 'sales@mainlinesystems.ng', rating: 5, status: 'active' },
    { id: 'v_2', tenantId: DEMO.greenfield, name: 'Netlink Distribution', category: 'Networking', contact: 'Aisha Suleiman', phone: '08145566778', email: 'quotes@netlinkdist.ng', rating: 4, status: 'active' },
    { id: 'v_3', tenantId: DEMO.greenfield, name: 'PowerLine Energy Services', category: 'Power', contact: 'Gbenga Owolabi', phone: '08056678901', email: 'service@powerline.ng', rating: 4, status: 'active' },
    { id: 'v_4', tenantId: DEMO.greenfield, name: 'Broadwalk Office Stores', category: 'Consumables', contact: 'Funmi Aderibigbe', phone: '08098762341', email: 'orders@broadwalk.ng', rating: 3, status: 'active' },
  ];
  const purchaseOrders: DataSet['purchaseOrders'] = [
    { id: 'po_1', tenantId: DEMO.greenfield, number: 'PO-1041', vendorId: 'v_2', status: 'ordered', requestedBy: DEMO_USERS.amara, approvedBy: DEMO_USERS.ngozi, branchId: 'b_abuja', createdAt: iso(6 * DAYS), items: [{ name: 'Ubiquiti UniFi 6 Long-Range AP', qty: 6, unitCost: 245000 }, { name: 'CAT6 outdoor cable (305m box)', qty: 4, unitCost: 132000 }] },
    { id: 'po_2', tenantId: DEMO.greenfield, number: 'PO-1040', vendorId: 'v_1', status: 'requested', requestedBy: DEMO_USERS.emeka, branchId: 'b_ikeja', createdAt: iso(1 * DAYS), items: [{ name: 'HP ProBook battery (BTX)', qty: 3, unitCost: 68000 }, { name: 'DDR4 8GB SODIMM', qty: 6, unitCost: 41000 }] },
    { id: 'po_3', tenantId: DEMO.greenfield, number: 'PO-1038', vendorId: 'v_4', status: 'received', requestedBy: DEMO_USERS.kemi, approvedBy: DEMO_USERS.ngozi, branchId: 'b_ikeja', createdAt: iso(16 * DAYS), receivedAt: iso(12 * DAYS), items: [{ name: 'HP 58A toner cartridge', qty: 4, unitCost: 71500 }, { name: 'A4 paper (carton)', qty: 20, unitCost: 9800 }] },
    { id: 'po_4', tenantId: DEMO.stives, number: 'PO-1009', vendorId: 'v_1', status: 'approved', requestedBy: DEMO_USERS.ifeoma, branchId: 'b_stives', createdAt: iso(3 * DAYS), approvedBy: DEMO_USERS.adaeze, items: [{ name: 'Workstation (lab annex spec)', qty: 2, unitCost: 640000 }, { name: 'Barcode printer', qty: 2, unitCost: 155000 }] },
  ];
  const stockItems: DataSet['stockItems'] = [
    { id: 'st_1', tenantId: DEMO.greenfield, name: 'CAT6 cable (m)', sku: 'SKU-1', category: 'Networking', qty: 480, reorderLevel: 150, unitCost: 430, branchId: 'b_ikeja' },
    { id: 'st_2', tenantId: DEMO.greenfield, name: 'RJ45 connectors', sku: 'SKU-2', category: 'Networking', qty: 130, reorderLevel: 100, unitCost: 120, branchId: 'b_ikeja' },
    { id: 'st_3', tenantId: DEMO.greenfield, name: 'HP 58A toner cartridge', sku: 'SKU-3', category: 'Consumables', qty: 3, reorderLevel: 4, unitCost: 71500, branchId: 'b_ikeja' },
    { id: 'st_4', tenantId: DEMO.greenfield, name: 'HDMI cable 3m', sku: 'SKU-4', category: 'AV', qty: 9, reorderLevel: 5, unitCost: 8500, branchId: 'b_ikeja' },
    { id: 'st_5', tenantId: DEMO.greenfield, name: 'DDR4 8GB SODIMM', sku: 'SKU-5', category: 'Components', qty: 2, reorderLevel: 4, unitCost: 41000, branchId: 'b_ikeja' },
  ];

  // ── Finance ──────────────────────────────────────────────────────────────
  const invoices: DataSet['invoices'] = [
    { id: 'inv_a1', tenantId: DEMO.techpros, number: 'INV-2081', clientName: 'St. Ives Specialist Hospital', clientTenantId: DEMO.stives, status: 'sent', vatRate: 0.075, whtRate: 0.05, issuedAt: iso(6 * DAYS), dueAt: isoAhead(8 * DAYS), createdBy: DEMO_USERS.segun, items: [{ desc: 'Managed IT services — November 2026', qty: 1, unitPrice: 350000 }, { desc: 'On-site support visits (6)', qty: 6, unitPrice: 25000 }] },
    { id: 'inv_a2', tenantId: DEMO.techpros, number: 'INV-2076', clientName: 'Lumen Hotels & Suites', clientTenantId: DEMO.lumen, status: 'paid', vatRate: 0.075, whtRate: 0.1, issuedAt: iso(18 * DAYS), dueAt: iso(4 * DAYS), paidAt: iso(6 * DAYS), createdBy: DEMO_USERS.segun, items: [{ desc: 'Premium hospitality IT ops — October 2026', qty: 1, unitPrice: 620000 }] },
    { id: 'inv_a3', tenantId: DEMO.techpros, number: 'INV-2069', clientName: 'Northgate Logistics Ltd', clientTenantId: DEMO.northgate, status: 'overdue', vatRate: 0.075, whtRate: 0.05, issuedAt: iso(38 * DAYS), dueAt: iso(10 * DAYS), createdBy: DEMO_USERS.segun, items: [{ desc: 'Essential support retainer — October 2026', qty: 1, unitPrice: 180000 }, { desc: 'Emergency call-out — PSU replacements', qty: 1, unitPrice: 95000 }] },
    { id: 'inv_gf1', tenantId: DEMO.greenfield, number: 'INV-3011', clientName: 'Greenfield Academy — PTO levy', status: 'paid', vatRate: 0.075, whtRate: 0, issuedAt: iso(30 * DAYS), dueAt: iso(16 * DAYS), paidAt: iso(18 * DAYS), createdBy: DEMO_USERS.femi, items: [{ desc: 'Smart board installation (JS3)', qty: 1, unitPrice: 2350000 }] },
    { id: 'inv_gf2', tenantId: DEMO.greenfield, number: 'INV-3012', clientName: 'Parent body — ICT levy term 2', status: 'draft', vatRate: 0.075, whtRate: 0, issuedAt: iso(2 * DAYS), dueAt: isoAhead(26 * DAYS), createdBy: DEMO_USERS.femi, items: [{ desc: 'ICT development levy', qty: 640, unitPrice: 15000 }] },
  ];
  const expenses: DataSet['expenses'] = [
    { id: 'ex_1', tenantId: DEMO.greenfield, title: 'Diesel — 1,200 litres', category: 'Power & fuel', amount: 1860000, branchId: 'b_ikeja', incurredAt: iso(4 * DAYS) },
    { id: 'ex_2', tenantId: DEMO.greenfield, title: 'MainOne fibre subscription — November', category: 'Connectivity', amount: 420000, branchId: 'b_ikeja', incurredAt: iso(9 * DAYS) },
    { id: 'ex_3', tenantId: DEMO.greenfield, title: 'Microsoft 365 Education licences (annual)', category: 'Software', amount: 2280000, departmentId: 'd_ict', incurredAt: iso(64 * DAYS) },
    { id: 'ex_4', tenantId: DEMO.greenfield, title: 'CAT6 + trunking for Wi-Fi rollout', category: 'Projects', amount: 3120000, branchId: 'b_abuja', projectId: 'pr_1', incurredAt: iso(13 * DAYS) },
    { id: 'ex_5', tenantId: DEMO.greenfield, title: 'Generator service & oils', category: 'Power & fuel', amount: 240000, branchId: 'b_ikeja', incurredAt: iso(21 * DAYS) },
    { id: 'ex_6', tenantId: DEMO.greenfield, title: 'Printer consumables restock', category: 'Printing', amount: 482200, departmentId: 'd_admin', incurredAt: iso(12 * DAYS) },
  ];
  const budgets: DataSet['budgets'] = [
    { id: 'bud_1', tenantId: DEMO.greenfield, name: 'ICT operations budget', departmentId: 'd_ict', year: 2026, amount: 18000000 },
    { id: 'bud_2', tenantId: DEMO.techpros, name: 'Service delivery opex', year: 2026, amount: 42000000 },
  ];

  // ── Knowledge base & documents ───────────────────────────────────────────
  const articles: DataSet['articles'] = [
    { id: 'kb_1', tenantId: DEMO.greenfield, title: 'Connect to the staff Wi-Fi (GREENFIELD-STAFF)', category: 'Guides', tags: ['wifi', 'network', 'onboarding'], status: 'published', authorId: DEMO_USERS.ngozi, helpful: 34, updatedAt: iso(40 * DAYS), body: '## Steps\n1. Open Wi-Fi settings and select **GREENFIELD-STAFF**.\n2. Sign in with your school email and password.\n3. Accept the certificate prompt (our RADIUS server).\n\nIf the network is not listed, move closer to a corridor AP or raise a ticket under _Network & connectivity_.\n\n## Notes\n- Personal routers are not allowed; they interfere with campus channels.\n- The student VLAN is separate — staff credentials will not join it.' },
    { id: 'kb_2', tenantId: DEMO.greenfield, title: 'Printer offline? Run this 60-second check first', category: 'Guides', tags: ['printing', 'troubleshooting'], status: 'published', authorId: DEMO_USERS.emeka, helpful: 57, updatedAt: iso(18 * DAYS), body: '1. Confirm the printer is powered and no error light is flashing.\n2. Check it is on **GREENFIELD-STAFF** or plugged into a working wall port.\n3. On your PC, remove and re-add the printer from _Printers & scanners_.\n4. Still down? Raise a ticket (Printing) and include a photo of the error light.' },
    { id: 'kb_3', tenantId: DEMO.greenfield, title: 'Reporting suspicious or phishing emails', category: 'Security', tags: ['security', 'phishing', 'email'], status: 'published', authorId: DEMO_USERS.ngozi, helpful: 41, updatedAt: iso(12 * DAYS), body: 'Do **not** click links or open attachments in unexpected emails — even from addresses you recognise.\n\n1. Forward the message to security@greenfield.edu.ng.\n2. Delete it from your inbox.\n3. If you already clicked, call ICT immediately; we will reset your password and scan the device.\n\nRecent campaigns have imitated fee reminders and invoice notices.' },
    { id: 'kb_4', tenantId: DEMO.greenfield, title: 'Reset your school email password', category: 'Accounts', tags: ['password', 'email', 'accounts'], status: 'published', authorId: DEMO_USERS.emeka, helpful: 69, updatedAt: iso(25 * DAYS), body: '1. Go to the staff portal and choose **Forgot password**.\n2. The reset link goes to your personal email registered with HR.\n3. Choose 12+ characters; passphrases are encouraged.\n\nNew passwords sync to Wi-Fi and the MIS within 15 minutes.' },
    { id: 'kb_5', tenantId: DEMO.greenfield, title: 'Booking the computer lab', category: 'Policies', tags: ['policy', 'lab', 'booking'], status: 'published', authorId: DEMO_USERS.tobi, helpful: 12, updatedAt: iso(60 * DAYS), body: 'Lab bookings open each Thursday for the following week.\n\n- One class at a time; exams take priority.\n- Software installs for a lesson need 48 hours notice via a service request.\n- Report faults at the end of your lesson so the next class is not stranded.' },
    { id: 'kb_6', tenantId: DEMO.stives, title: 'EMR access for locum staff', category: 'Accounts', tags: ['emr', 'accounts'], status: 'published', authorId: DEMO_USERS.ifeoma, helpful: 8, updatedAt: iso(30 * DAYS), body: 'Locum accounts are time-boxed. Send the signed confidentiality form to Admin; accounts expire automatically at the end of the engagement.' },
  ];
  const documents: DataSet['documents'] = [
    { id: 'doc_1', tenantId: DEMO.greenfield, title: 'Network topology — Ikeja campus', kind: 'diagram', version: '3.2', ownerId: DEMO_USERS.amara, summary: 'Authoritative map of WAN, firewall, core and access layers, with IP plan.', assetId: 'a_16', updatedAt: iso(35 * DAYS) },
    { id: 'doc_2', tenantId: DEMO.greenfield, title: 'Acceptable Use Policy (staff & students)', kind: 'policy', version: '2.0', ownerId: DEMO_USERS.ngozi, summary: 'Rules for device, internet and data use; signed annually.', expiresAt: isoAhead(200 * DAYS), updatedAt: iso(160 * DAYS) },
    { id: 'doc_3', tenantId: DEMO.greenfield, title: 'Backup & restore SOP — ERP and shares', kind: 'sop', version: '1.4', ownerId: DEMO_USERS.emeka, summary: 'Nightly cloud sync, weekly offline copy, quarterly restore drill.', updatedAt: iso(50 * DAYS) },
    { id: 'doc_4', tenantId: DEMO.greenfield, title: 'Sophos XGS 136 configuration register', kind: 'sop', version: '7', ownerId: DEMO_USERS.amara, summary: 'Firewall ruleset, NAT, VLANs and remote access, change-controlled.', assetId: 'a_16', updatedAt: iso(9 * DAYS) },
    { id: 'doc_5', tenantId: DEMO.greenfield, title: 'IT disaster recovery plan', kind: 'sop', version: '1.1', ownerId: DEMO_USERS.ngozi, summary: 'Priorities, contacts and recovery order for full-site loss.', expiresAt: isoAhead(90 * DAYS), updatedAt: iso(120 * DAYS) },
    { id: 'doc_6', tenantId: DEMO.stives, title: 'Handover — lab annex cabling', kind: 'handover', version: '1.0', ownerId: DEMO_USERS.yusuf, summary: 'As-built: 24 data points, cabinet layout, test results.', updatedAt: iso(20 * DAYS) },
  ];

  // ── Compliance ───────────────────────────────────────────────────────────
  const assessments: DataSet['assessments'] = [
    { id: 'as_1', tenantId: DEMO.greenfield, name: 'Q4 IT infrastructure assessment', framework: 'Internal', status: 'completed', score: 68, conductedBy: DEMO_USERS.ngozi, startedAt: iso(32 * DAYS), completedAt: iso(21 * DAYS) },
    { id: 'as_2', tenantId: DEMO.greenfield, name: 'NDPA readiness self-assessment', framework: 'NDPA', status: 'in_progress', score: 45, conductedBy: DEMO_USERS.ngozi, startedAt: iso(6 * DAYS) },
    { id: 'as_3', tenantId: DEMO.stives, name: 'Annual security baseline (NIST CSF)', framework: 'NIST CSF', status: 'completed', score: 57, conductedBy: DEMO_USERS.adaeze, startedAt: iso(80 * DAYS), completedAt: iso(66 * DAYS) },
  ];
  const findings: DataSet['findings'] = [
    { id: 'f_1', tenantId: DEMO.greenfield, assessmentId: 'as_1', title: 'No documented backup restore drill in 12 months', severity: 'high', status: 'in_progress', ownerId: DEMO_USERS.emeka, dueAt: isoAhead(20 * DAYS), detail: 'Backups run nightly but restoration has never been proven. A failed restore discovered during an incident is too late.' },
    { id: 'f_2', tenantId: DEMO.greenfield, assessmentId: 'as_1', title: 'Core switch is a single point of failure', severity: 'critical', status: 'open', ownerId: DEMO_USERS.amara, dueAt: isoAhead(45 * DAYS), detail: 'One CBS350 carries all access uplinks. No cold spare on-site; RMA lead time is 2–4 weeks.' },
    { id: 'f_3', tenantId: DEMO.greenfield, assessmentId: 'as_1', title: '9 endpoints past warranty', severity: 'medium', status: 'open', ownerId: DEMO_USERS.ngozi, detail: 'Warranty lapse increases mean time to repair; refresh or extended coverage advised.' },
    { id: 'f_4', tenantId: DEMO.greenfield, assessmentId: 'as_2', title: 'Privacy policy not published on the parent portal', severity: 'medium', status: 'in_progress', ownerId: DEMO_USERS.ngozi, detail: 'NDPA expects a public notice describing data collected on pupils and guardians.' },
    { id: 'f_5', tenantId: DEMO.greenfield, assessmentId: 'as_2', title: 'No records-retention schedule', severity: 'medium', status: 'open', ownerId: DEMO_USERS.kemi, detail: 'Define how long exam records, CCTV and access logs are kept and who approves deletion.' },
    { id: 'f_6', tenantId: DEMO.stives, assessmentId: 'as_3', title: 'Shared accounts in use at two nursing stations', severity: 'critical', status: 'in_progress', ownerId: DEMO_USERS.ifeoma, detail: 'Shared logins defeat audit trails for EMR access; migrate to per-user accounts with badge tap-on.' },
  ];
  const risks: DataSet['risks'] = [
    { id: 'r_1', tenantId: DEMO.greenfield, title: 'Loss of the core switch halts all campus connectivity', category: 'Infrastructure', likelihood: 2, impact: 5, ownerId: DEMO_USERS.amara, status: 'mitigating', treatment: 'Procure cold spare; enable weekly config export to cloud.', dueAt: isoAhead(45 * DAYS), createdAt: iso(22 * DAYS) },
    { id: 'r_2', tenantId: DEMO.greenfield, title: 'Ransomware through a phishing click', category: 'Security', likelihood: 4, impact: 5, ownerId: DEMO_USERS.ngozi, status: 'open', treatment: 'Staff awareness refresh, mail filtering rules, offline backups verified quarterly.', dueAt: isoAhead(30 * DAYS), createdAt: iso(25 * DAYS) },
    { id: 'r_3', tenantId: DEMO.greenfield, title: 'Extended mains outage exceeds generator capacity', category: 'Power', likelihood: 3, impact: 4, ownerId: DEMO_USERS.femi, status: 'open', treatment: 'Fuel buffer raised to 2 weeks; ATS test added to monthly maintenance.', createdAt: iso(18 * DAYS) },
    { id: 'r_4', tenantId: DEMO.greenfield, title: 'Key-person dependency on the network engineer', category: 'People', likelihood: 3, impact: 4, ownerId: DEMO_USERS.chidera, status: 'mitigating', treatment: 'Document all configs in the register; cross-train the technician.', createdAt: iso(15 * DAYS) },
    { id: 'r_5', tenantId: DEMO.greenfield, title: 'ERP licence lapses during exam window', category: 'Vendor', likelihood: 2, impact: 4, ownerId: DEMO_USERS.femi, status: 'accepted', treatment: 'Renewal reminder 60 days out; contingency exam mode documented.', createdAt: iso(10 * DAYS) },
    { id: 'r_6', tenantId: DEMO.stives, title: 'Guest and clinical traffic share one VLAN', category: 'Security', likelihood: 4, impact: 4, ownerId: DEMO_USERS.ifeoma, status: 'mitigating', treatment: 'LAN redesign project in delivery (TechPros).', createdAt: iso(24 * DAYS) },
  ];

  // ── Audit seed ───────────────────────────────────────────────────────────
  const auditLogs: DataSet['auditLogs'] = [
    { id: 'aud_1', tenantId: DEMO.greenfield, actorId: DEMO_USERS.ngozi, actorName: 'Ngozi Eze', action: 'po.status_changed', entity: 'purchaseOrder', entityId: 'po_3', summary: 'PO-1038: approved → received', at: iso(12 * DAYS) },
    { id: 'aud_2', tenantId: DEMO.greenfield, actorId: DEMO_USERS.emeka, actorName: 'Emeka Obi', action: 'workorder.status_changed', entity: 'workOrder', entityId: 'wo_2', summary: 'WO-1030 computer lab servicing: in progress → completed', at: iso(6 * DAYS) },
    { id: 'aud_3', tenantId: DEMO.greenfield, actorId: DEMO_USERS.amara, actorName: 'Amara Bello', action: 'docs.registered', entity: 'document', entityId: 'doc_4', summary: 'Updated firewall configuration register to v7', at: iso(9 * DAYS) },
    { id: 'aud_4', tenantId: DEMO.greenfield, actorId: DEMO_USERS.ngozi, actorName: 'Ngozi Eze', action: 'user.invited', entity: 'invitation', entityId: 'inv_1', summary: 'Invited Bisi Fashola as it_technician', at: iso(2 * DAYS) },
    { id: 'aud_5', tenantId: DEMO.techpros, actorId: DEMO_USERS.segun, actorName: 'Segun Ajayi', action: 'invoice.issued', entity: 'invoice', entityId: 'inv_a1', summary: 'Issued invoice to St. Ives Specialist Hospital', at: iso(6 * DAYS) },
  ];

  const notifications: DataSet['notifications'] = [
    { id: 'n_1', tenantId: DEMO.greenfield, userId: DEMO_USERS.ngozi, title: 'SLA at risk on TKT-1024', body: 'Medium ticket “Internet throttled during online exams” is inside 4h of its response target.', read: false, at: iso(3 * HOURS), link: '/app/service-desk' },
    { id: 'n_2', tenantId: DEMO.greenfield, userId: DEMO_USERS.emeka, title: 'Work order due tomorrow', body: 'Power systems monthly inspection for the APC Smart-UPS 3kVA.', read: false, at: iso(26 * HOURS), link: '/app/maintenance' },
    { id: 'n_3', tenantId: DEMO.techpros, userId: DEMO_USERS.adaeze, title: 'Agreement expiring soon', body: 'Northgate Logistics essential retainer renews in 24 days.', read: false, at: iso(1 * DAYS), link: '/app/clients' },
    { id: 'n_4', tenantId: DEMO.stives, userId: DEMO_USERS.ifeoma, title: 'Critical ticket in progress', body: 'EMR access issue is being handled by Yusuf Garba.', read: true, at: iso(1 * HOURS), link: '/app/service-desk' },
  ];

  const reportRuns: DataSet['reportRuns'] = [
    { id: 'rr_1', tenantId: DEMO.greenfield, reportId: 'itsm-monthly', title: 'Monthly IT operations report — October', runBy: DEMO_USERS.ngozi, at: iso(10 * DAYS), params: { month: '2026-10' } },
  ];

  const counters: Record<string, number> = {
    [`${DEMO.greenfield}:ticket`]: 1030 + ticketTitles.length,
    [`${DEMO.greenfield}:asset`]: 1000 + assets.length,
    [`${DEMO.greenfield}:workorder`]: 1032,
    [`${DEMO.greenfield}:po`]: 1041,
    [`${DEMO.greenfield}:invoice`]: 3012,
    [`${DEMO.techpros}:invoice`]: 2081,
    [`${DEMO.techpros}:ticket`]: 1010,
    [`${DEMO.stives}:ticket`]: 1007,
    [`${DEMO.stives}:po`]: 1009,
    [`${DEMO.northgate}:ticket`]: 1004,
    [`${DEMO.lumen}:ticket`]: 1012,
  };

  void pick; void between;
  return {
    tenants, users, memberships, invitations, branches, departments,
    tickets, ticketMessages, slaPolicies, assets, maintenancePlans, workOrders,
    devices, alerts, projects, tasks, agreements, contacts,
    vendors, purchaseOrders, stockItems, invoices, expenses, budgets,
    articles, documents, assessments, findings, risks,
    auditLogs, notifications, reportRuns, counters,
  };
}
