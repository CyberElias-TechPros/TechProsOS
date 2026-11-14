/** Forward-only migrations. Run with npm run db:migrate before serving traffic.
 * Ownership/identity/audit/security tables are relational. Validated domain documents
 * have a relational tenant envelope, composite primary key and natural-key indexes.
 * Cross-document references are checked inside the same tenant-locked transaction.
 */
export const RECORD_KINDS = [
  'branches', 'departments', 'tickets', 'ticketMessages', 'slaPolicies', 'assets', 'maintenancePlans', 'workOrders',
  'devices', 'alerts', 'projects', 'tasks', 'agreements', 'contacts', 'vendors', 'purchaseOrders', 'stockItems',
  'invoices', 'expenses', 'budgets', 'articles', 'documents', 'assessments', 'findings', 'risks', 'notifications',
  'reportRuns', 'delegations', 'reportSchedules', 'privacyRequests', 'attachments',
] as const;
export type RecordKind = typeof RECORD_KINDS[number];
const initial = `
CREATE TABLE tenants (
  id uuid PRIMARY KEY, data jsonb NOT NULL, revision bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (data->>'id' = id::text), CHECK (jsonb_typeof(data) = 'object')
);
CREATE INDEX tenants_provider ON tenants ((data->>'providerId')) WHERE data->>'providerId' IS NOT NULL;
CREATE TABLE users (
  id uuid PRIMARY KEY, email text NOT NULL, name text NOT NULL, phone text NOT NULL DEFAULT '', title text NOT NULL DEFAULT '',
  password_hash text NOT NULL, status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','deactivated')),
  email_verified_at timestamptz, privacy_consent_at timestamptz, mfa_secret text, mfa_enabled boolean NOT NULL DEFAULT false,
  mfa_last_step bigint NOT NULL DEFAULT -1, recovery_codes jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email = lower(email))
);
CREATE UNIQUE INDEX users_email_unique ON users(email);
CREATE TABLE memberships (
  tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL, status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  branch_id uuid, department_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,user_id), FOREIGN KEY (tenant_id,branch_id) REFERENCES records(tenant_id,id),
  FOREIGN KEY (tenant_id,department_id) REFERENCES records(tenant_id,id)
);
CREATE INDEX memberships_user ON memberships(user_id) WHERE status='active';
CREATE TABLE records (
  tenant_id uuid NOT NULL REFERENCES tenants(id), id uuid NOT NULL, kind text NOT NULL CHECK (kind IN (${RECORD_KINDS.map(k => `'${k}'`).join(',')})),
  data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id), CHECK (data->>'id' = id::text AND data->>'tenantId' = tenant_id::text)
);
CREATE INDEX records_tenant_kind ON records(tenant_id,kind);
CREATE INDEX records_entity ON records(tenant_id,kind,(data->>'entityId'));
CREATE INDEX tickets_queue ON records(tenant_id,(data->>'status'),(data->>'assigneeId')) WHERE kind='tickets';
CREATE INDEX tickets_requester ON records(tenant_id,(data->>'requesterId')) WHERE kind='tickets';
CREATE INDEX messages_ticket ON records(tenant_id,(data->>'ticketId')) WHERE kind='ticketMessages';
CREATE INDEX notifications_user ON records(tenant_id,(data->>'userId'),(data->>'read')) WHERE kind='notifications';
CREATE INDEX expenses_project ON records(tenant_id,(data->>'projectId')) WHERE kind='expenses';
CREATE UNIQUE INDEX asset_tag ON records(tenant_id,(data->>'tag')) WHERE kind='assets';
CREATE UNIQUE INDEX asset_serial ON records(tenant_id,(data->>'serial')) WHERE kind='assets' AND data->>'serial' <> '';
CREATE UNIQUE INDEX ticket_number ON records(tenant_id,(data->>'number')) WHERE kind='tickets';
CREATE UNIQUE INDEX invoice_number ON records(tenant_id,(data->>'number')) WHERE kind='invoices';
CREATE UNIQUE INDEX po_number ON records(tenant_id,(data->>'number')) WHERE kind='purchaseOrders';
CREATE UNIQUE INDEX wo_number ON records(tenant_id,(data->>'number')) WHERE kind='workOrders';
CREATE UNIQUE INDEX active_device_alert ON records(tenant_id,(data->>'deviceId')) WHERE kind='alerts' AND data->>'status' <> 'resolved';
CREATE UNIQUE INDEX maintenance_occurrence ON records(tenant_id,(data->>'planId'),(data->>'assetId'),(data->>'dueAt')) WHERE kind='workOrders' AND data->>'planId' IS NOT NULL;
CREATE UNIQUE INDEX active_delegation ON records(tenant_id,(data->>'userId')) WHERE kind='delegations' AND data->>'status'='active';
CREATE TABLE attachment_blobs (
  tenant_id uuid NOT NULL, id uuid NOT NULL, content bytea NOT NULL, PRIMARY KEY (tenant_id,id), FOREIGN KEY (tenant_id,id) REFERENCES records(tenant_id,id)
);
CREATE TABLE sessions (
  token_hash char(64) PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_hash char(64) NOT NULL, active_tenant_id uuid REFERENCES tenants(id),
  expires_at timestamptz NOT NULL, idle_expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE auth_tokens (
  token_hash char(64) PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('verify_email','reset_password','mfa')),
  expires_at timestamptz NOT NULL, used_at timestamptz, payload jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_tokens_user_kind ON auth_tokens(user_id,kind);
CREATE TABLE invitations (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), email text NOT NULL, name text NOT NULL, role text NOT NULL,
  token_hash char(64) UNIQUE, status text NOT NULL CHECK (status IN ('pending','accepted','revoked')),
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), accepted_by uuid REFERENCES users(id),
  CHECK (email = lower(email))
);
CREATE UNIQUE INDEX pending_invitation ON invitations(tenant_id,email) WHERE status='pending';
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY, tenant_id uuid REFERENCES tenants(id), actor_id uuid, actor_name text NOT NULL,
  action text NOT NULL, entity text NOT NULL, entity_id text NOT NULL, summary text NOT NULL, diff jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_tenant_time ON audit_logs(tenant_id,at DESC);
CREATE INDEX audit_entity ON audit_logs(tenant_id,entity,entity_id);
CREATE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit log is append-only'; END; $$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
CREATE TABLE counters (tenant_id uuid NOT NULL REFERENCES tenants(id), kind text NOT NULL, value bigint NOT NULL, PRIMARY KEY (tenant_id,kind));
CREATE TABLE outbox (
  id uuid PRIMARY KEY, tenant_id uuid REFERENCES tenants(id), dedupe_key text NOT NULL UNIQUE,
  recipient text NOT NULL, subject text NOT NULL, body text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed')),
  attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz
);
CREATE INDEX outbox_due ON outbox(status,next_attempt_at);
CREATE TABLE jobs (
  id uuid PRIMARY KEY, tenant_id uuid REFERENCES tenants(id), kind text NOT NULL, dedupe_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  run_after timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0, locked_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE INDEX jobs_due ON jobs(status,run_after);
CREATE TABLE checkouts (
  reference text PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), kind text NOT NULL CHECK (kind IN ('subscription','invoice')),
  entity_id text NOT NULL, expected_amount bigint NOT NULL CHECK (expected_amount > 0), currency text NOT NULL DEFAULT 'NGN',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','expired')), created_by uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), paid_at timestamptz
);
CREATE TABLE payment_events (
  provider text NOT NULL, event_id text NOT NULL, reference text, payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','ignored','failed')),
  received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz, last_error text, PRIMARY KEY (provider,event_id)
);
CREATE TABLE device_credentials (
  device_id uuid NOT NULL, tenant_id uuid NOT NULL, token_hash char(64) NOT NULL,
  last_timestamp bigint NOT NULL DEFAULT 0, PRIMARY KEY (tenant_id,device_id), FOREIGN KEY (tenant_id,device_id) REFERENCES records(tenant_id,id)
);
CREATE TABLE ingestion_events (tenant_id uuid NOT NULL, device_id uuid NOT NULL, event_id text NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id,device_id,event_id));
CREATE TABLE rate_limits (key text PRIMARY KEY, window_start timestamptz NOT NULL, count integer NOT NULL);
`;
// The membership foreign keys are added after records exists.
const sql = initial.replace(/  branch_id uuid, department_id uuid, created_at timestamptz NOT NULL DEFAULT now\(\),\n  PRIMARY KEY \(tenant_id,user_id\), FOREIGN KEY \(tenant_id,branch_id\) REFERENCES records\(tenant_id,id\),\n  FOREIGN KEY \(tenant_id,department_id\) REFERENCES records\(tenant_id,id\)\n/, '  branch_id uuid, department_id uuid, created_at timestamptz NOT NULL DEFAULT now(),\n  PRIMARY KEY (tenant_id,user_id)\n') + '\nALTER TABLE memberships ADD FOREIGN KEY (tenant_id,branch_id) REFERENCES records(tenant_id,id); ALTER TABLE memberships ADD FOREIGN KEY (tenant_id,department_id) REFERENCES records(tenant_id,id);';
export const MIGRATIONS = [{ version: 1, sql }];
