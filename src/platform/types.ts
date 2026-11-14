/**
 * TechPros One — platform entity model.
 * Mirrors README §5 database domains. Every tenant-owned record carries tenantId;
 * client tenants additionally resolve to a providerId through the tenant record.
 */

export type ID = string;

// ── Tenancy & identity ────────────────────────────────────────────────────────
export type TenantType = 'organisation' | 'service_provider';
export type PlanId = 'starter' | 'professional' | 'business' | 'enterprise' | 'msp_launch' | 'msp_growth' | 'msp_scale';

export interface Tenant {
  id: ID;
  name: string;
  slug: string;
  type: TenantType;
  industry: string;
  plan: PlanId;
  status: 'active' | 'suspended';
  providerId?: ID; // set when this tenant is a client of a service provider
  city: string;
  createdAt: string;
  aiAssistCredits: number;
  trialEndsAt?: string;
  subscriptionStatus?: 'trialing' | 'active' | 'past_due' | 'cancelled';
  subscriptionExpiresAt?: string;
  billingEmail?: string;
  bankDetails?: { bank: string; accountName: string; accountNumber: string };
  notificationEmails?: boolean;
}

export interface User {
  id: ID;
  name: string;
  email: string;
  phone: string;
  title: string;
  status: 'active' | 'invited' | 'deactivated';
  createdAt: string;
  emailVerified?: boolean;
  mfaEnabled?: boolean;
}

export type RoleId =
  | 'org_owner' | 'org_admin' | 'it_manager' | 'it_technician' | 'network_engineer'
  | 'security_officer' | 'procurement_officer' | 'finance_officer' | 'dept_manager'
  | 'employee' | 'auditor'
  | 'svc_delivery_manager' | 'account_manager' | 'support_lead' | 'field_technician' | 'project_manager';

export interface Membership {
  userId: ID;
  tenantId: ID;
  role: RoleId;
  departmentId?: ID;
  branchId?: ID;
  status: 'active' | 'suspended';
}

export interface Invitation {
  id: ID;
  tenantId: ID;
  email: string;
  name: string;
  role: RoleId;
  status: 'pending' | 'accepted' | 'revoked';
  createdAt: string;
  expiresAt: string;
}

// ── Organisation structure ────────────────────────────────────────────────────
export interface Branch { id: ID; tenantId: ID; name: string; city: string; address: string; status: 'active' | 'closed'; }
export interface Department { id: ID; tenantId: ID; branchId: ID; name: string; headUserId?: ID; }

// ── ITSM ──────────────────────────────────────────────────────────────────────
export type TicketKind = 'incident' | 'request' | 'problem' | 'change';
export type TicketStatus = 'new' | 'triaged' | 'assigned' | 'in_progress' | 'pending' | 'resolved' | 'closed';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type ImpactUrgency = 'high' | 'medium' | 'low';

export interface Ticket {
  id: ID;
  tenantId: ID;
  number: string;
  kind: TicketKind;
  title: string;
  description: string;
  category: string;
  requesterId: ID;
  assigneeId?: ID;
  branchId?: ID;
  departmentId?: ID;
  assetId?: ID;
  impact: ImpactUrgency;
  urgency: ImpactUrgency;
  priority: Priority;
  priorityOverridden: boolean;
  status: TicketStatus;
  slaPolicyId?: ID;
  responseDueAt?: string;
  resolveDueAt?: string;
  firstResponseAt?: string;
  resolvedAt?: string;
  closedAt?: string;
  resolutionSummary?: string;
  csat?: number; // 1-5
  source: 'portal' | 'email' | 'monitoring' | 'phone' | 'walkin';
  createdAt: string;
  updatedAt: string;
  pausedAt?: string;
  pausedMs?: number;
  pendingReason?: string;
  changePlan?: string;
  rollbackPlan?: string;
  scheduledAt?: string;
  approvedBy?: string;
  resolutionArticleId?: string;
}

export interface TicketMessage {
  id: ID;
  tenantId: ID;
  ticketId: ID;
  authorId: ID;
  body: string;
  internal: boolean;
  createdAt: string;
}

export interface SlaPolicy {
  id: ID;
  tenantId: ID;
  name: string;
  /** targets in business minutes */
  targets: Record<Priority, { response: number; resolve: number }>;
  workStartHour: number; // e.g. 8
  workEndHour: number;   // e.g. 18
  workDays: number[];    // 1-5 Mon..Fri
  holidays: string[];    // ISO dates in the policy timezone
  timezone: string;      // IANA zone; WAT is Africa/Lagos (UTC+1, no DST)
}

// ── Assets ────────────────────────────────────────────────────────────────────
export type AssetLifecycle = 'in_service' | 'in_storage' | 'in_repair' | 'retired' | 'disposed';
export type AssetCondition = 'excellent' | 'good' | 'fair' | 'poor';

export interface Asset {
  id: ID;
  tenantId: ID;
  tag: string;
  name: string;
  category: string;
  manufacturer: string;
  model: string;
  serial: string;
  branchId: ID;
  departmentId?: ID;
  assigneeId?: ID;
  purchaseDate: string;
  purchaseCost: number;
  usefulLifeYears: number;
  warrantyExpiry?: string;
  lifecycle: AssetLifecycle;
  condition: AssetCondition;
  notes?: string;
  createdAt: string;
}

// ── Maintenance ───────────────────────────────────────────────────────────────
export interface MaintenancePlan {
  id: ID;
  tenantId: ID;
  name: string;
  assetCategory: string;
  intervalMonths: number;
  checklist: string[];
  assigneeId: ID;
  nextRunAt: string;
  active: boolean;
}

export type WorkOrderStatus = 'open' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export interface WorkOrder {
  id: ID;
  tenantId: ID;
  number: string;
  title: string;
  kind: 'preventive' | 'corrective';
  planId?: ID;
  assetId?: ID;
  branchId?: ID;
  assigneeId?: ID;
  status: WorkOrderStatus;
  dueAt: string;
  completedAt?: string;
  checklist: { item: string; done: boolean }[];
  labourHours?: number;
  cost?: number;
  signOffBy?: string;
  notes?: string;
  createdAt: string;
}

// ── Infrastructure & monitoring ───────────────────────────────────────────────
export type DeviceKind = 'wan' | 'router' | 'firewall' | 'switch' | 'ap' | 'server' | 'ups' | 'printer' | 'cctv';
export type DeviceStatus = 'up' | 'degraded' | 'down';

export interface Device {
  id: ID;
  tenantId: ID;
  name: string;
  kind: DeviceKind;
  model: string;
  ip: string;
  branchId: ID;
  parentId?: ID; // topology uplink
  monitored: boolean;
  status: DeviceStatus;
  latencyMs: number;
  packetLossPct: number;
  cpuPct?: number;
  memPct?: number;
  storagePct?: number;
  lastSeenAt: string;
}

export interface Alert {
  id: ID;
  tenantId: ID;
  deviceId: ID;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  status: 'active' | 'acknowledged' | 'resolved';
  incidentId?: ID;
  createdAt: string;
  ackAt?: string;
  resolvedAt?: string;
}

// ── Projects ──────────────────────────────────────────────────────────────────
export interface Milestone { id: ID; title: string; dueAt: string; done: boolean; }
export type ProjectStatus = 'planning' | 'in_progress' | 'on_hold' | 'completed';
export interface Project {
  id: ID;
  tenantId: ID;        // owning workspace
  clientTenantId?: ID; // set when delivered by a provider for a client
  name: string;
  kind: string;
  status: ProjectStatus;
  managerId: ID;
  branchId?: ID;
  budget: number;
  spent: number;
  startAt: string;
  dueAt: string;
  milestones: Milestone[];
  description: string;
  createdAt: string;
}
export type TaskColumn = 'backlog' | 'todo' | 'doing' | 'review' | 'done';
export interface TaskItem {
  id: ID;
  tenantId: ID;
  projectId: ID;
  title: string;
  column: TaskColumn;
  assigneeId?: ID;
  priority: Priority;
  dueAt?: string;
  createdAt: string;
}

// ── Clients & agreements (service provider) ──────────────────────────────────
export interface ServiceAgreement {
  id: ID;
  tenantId: ID;        // provider tenant
  clientTenantId: ID;
  name: string;
  tier: 'Essential' | 'Managed' | 'Premium';
  monthlyFee: number;
  slaPolicyId?: ID;
  startsAt: string;
  renewsAt: string;
  status: 'active' | 'expiring' | 'expired';
}
export interface Contact {
  id: ID;
  tenantId: ID;        // provider tenant (owner of the record)
  clientTenantId: ID;
  name: string;
  role: string;
  email: string;
  phone: string;
  primary: boolean;
}

// ── Procurement ───────────────────────────────────────────────────────────────
export interface Vendor {
  id: ID; tenantId: ID; name: string; category: string; contact: string; phone: string; email: string;
  rating: number; status: 'active' | 'inactive';
}
export type POStatus = 'requested' | 'approved' | 'ordered' | 'received' | 'cancelled';
export interface PurchaseOrder {
  id: ID;
  tenantId: ID;
  number: string;
  vendorId: ID;
  status: POStatus;
  items: { name: string; qty: number; unitCost: number; kind?: 'capital' | 'consumable' }[];
  requestedBy: ID;
  approvedBy?: ID;
  branchId?: ID;
  note?: string;
  createdAt: string;
  receivedAt?: string;
  receivedBy?: ID;
  receivedBranchId?: ID;
}
export interface StockItem {
  id: ID; tenantId: ID; name: string; sku: string; category: string; qty: number; reorderLevel: number; unitCost: number; branchId: ID;
}

// ── Finance (operational, not full accounting) ────────────────────────────────
export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'cancelled';
export interface PaymentRecord {
  id: ID; amount: number; method: 'bank_transfer' | 'cash' | 'paystack' | 'withholding_credit';
  reference: string; recordedBy: ID; at: string; creditNoteRef?: string;
}
export interface InvoiceItem { desc: string; qty: number; unitPrice: number; }
export interface Invoice {
  id: ID; tenantId: ID; number: string; clientName: string; clientTenantId?: ID;
  status: InvoiceStatus; items: InvoiceItem[];
  vatRate: number;  // 0.075
  whtRate: number;  // 0 / 0.05 / 0.10 — shown as deduction note
  issuedAt: string; dueAt: string; paidAt?: string;
  createdBy: ID;
  payments?: PaymentRecord[];
  notes?: string;
  checkoutReference?: string;
}
export interface Expense {
  id: ID; tenantId: ID; title: string; category: string; amount: number;
  branchId?: ID; departmentId?: ID; vendorId?: ID; projectId?: ID; incurredAt: string;
}
export interface Budget {
  id: ID; tenantId: ID; name: string; departmentId?: ID; year: number; amount: number;
}

// ── Documentation & knowledge ────────────────────────────────────────────────
export interface KnowledgeArticle {
  id: ID; tenantId: ID; title: string; body: string; category: string; tags: string[];
  status: 'draft' | 'published'; authorId: ID; helpful: number; updatedAt: string;
}
export interface DocumentRecord {
  id: ID; tenantId: ID; title: string; kind: 'policy' | 'sop' | 'diagram' | 'manual' | 'report' | 'handover';
  version: string; ownerId: ID; summary: string; assetId?: ID; expiresAt?: string; updatedAt: string;
  versions?: { version: string; summary: string; at: string; by: ID }[];
}

// ── Compliance ────────────────────────────────────────────────────────────────
export type FindingStatus = 'open' | 'in_progress' | 'remediated';
export interface Finding {
  id: ID; tenantId: ID; assessmentId: ID; title: string; severity: 'critical' | 'high' | 'medium' | 'low';
  status: FindingStatus; ownerId: ID; dueAt?: string; detail: string;
}
export interface Assessment {
  id: ID; tenantId: ID; name: string; framework: 'ISO 27001' | 'NIST CSF' | 'NDPA' | 'Internal';
  status: 'in_progress' | 'completed';
  /** percent 0-100 of controls satisfied — self-assessment indicator, never a certification */
  score: number;
  conductedBy: ID; startedAt: string; completedAt?: string;
  controls?: { id: ID; title: string; response: 'yes' | 'no' | 'na'; evidence: string }[];
}
export type RiskStatus = 'open' | 'mitigating' | 'accepted' | 'closed';
export interface Risk {
  id: ID; tenantId: ID; title: string; category: string;
  likelihood: 1 | 2 | 3 | 4 | 5; impact: 1 | 2 | 3 | 4 | 5;
  ownerId: ID; status: RiskStatus; treatment: string; dueAt?: string; createdAt: string;
}

// ── Platform services ────────────────────────────────────────────────────────
export interface AuditLog {
  id: ID; tenantId: ID; actorId: ID; actorName: string;
  action: string;       // e.g. 'ticket.status_change'
  entity: string; entityId: ID;
  summary: string;
  at: string;
  /** previous/changed fields for diffs */
  diff?: { field: string; from: unknown; to: unknown }[];
}
export interface NotificationItem {
  id: ID; tenantId: ID; userId: ID; title: string; body: string;
  at: string; read: boolean; link?: string;
}
export interface ReportRun {
  id: ID; tenantId: ID; reportId: string; title: string; runBy: ID; at: string; params: Record<string, string>;
}

// ── Explicit, expiring provider access and platform operations ────────────────
export interface Delegation {
  id: ID; tenantId: ID; providerId: ID; userId: ID;
  permissions: import('./permissions').Permission[];
  expiresAt: string; status: 'active' | 'revoked'; createdBy: ID; createdAt: string;
}
export interface ReportSchedule {
  id: ID; tenantId: ID; reportId: string; name: string;
  cadence: 'daily' | 'weekly' | 'monthly'; recipients: string[];
  nextRunAt: string; active: boolean; branchId?: ID; createdBy: ID;
}
export interface PrivacyRequest {
  id: ID; tenantId: ID; userId: ID; kind: 'export' | 'erasure';
  status: 'pending' | 'completed' | 'rejected'; reason: string; createdAt: string; resolvedAt?: string;
}
export interface AttachmentMeta {
  id: ID; tenantId: ID; entityId: ID; name: string; mime: string; size: number; createdBy: ID; createdAt: string;
}

// ── Store shape ──────────────────────────────────────────────────────────────
export interface DataSet {
  tenants: Tenant[];
  users: User[];
  memberships: Membership[];
  invitations: Invitation[];
  branches: Branch[];
  departments: Department[];
  tickets: Ticket[];
  ticketMessages: TicketMessage[];
  slaPolicies: SlaPolicy[];
  assets: Asset[];
  maintenancePlans: MaintenancePlan[];
  workOrders: WorkOrder[];
  devices: Device[];
  alerts: Alert[];
  projects: Project[];
  tasks: TaskItem[];
  agreements: ServiceAgreement[];
  contacts: Contact[];
  vendors: Vendor[];
  purchaseOrders: PurchaseOrder[];
  stockItems: StockItem[];
  invoices: Invoice[];
  expenses: Expense[];
  budgets: Budget[];
  articles: KnowledgeArticle[];
  documents: DocumentRecord[];
  assessments: Assessment[];
  findings: Finding[];
  risks: Risk[];
  auditLogs: AuditLog[];
  notifications: NotificationItem[];
  reportRuns: ReportRun[];
  delegations: Delegation[];
  reportSchedules: ReportSchedule[];
  privacyRequests: PrivacyRequest[];
  attachments: AttachmentMeta[];
  counters: Record<string, number>; // per-tenant numbering sequences, key `${tenantId}:${kind}`
}
