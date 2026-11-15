/**
 * Public privacy notice. Every claim here is traceable to the implementation: the fields listed
 * are the ones the schema stores, the sub-processors are the ones the server actually calls, and
 * the retention periods are the ones the scheduled job enforces. It deliberately does not assert
 * certifications or compliance outcomes the software has not been assessed for.
 */
import { Clause, LEGAL_ENTITY, LEGAL_TRADING, LegalLayout } from './LegalLayout';

export default function Privacy() {
  return (
    <LegalLayout
      title="Privacy notice"
      intro={`This notice explains what ${LEGAL_ENTITY} (trading as ${LEGAL_TRADING}) processes when you use TechPros One, why, and the controls available to you. It is written to support the Nigeria Data Protection Act (NDPA). Your workspace administrator is the controller for the operational records they create; we act as processor for that content and as controller for account and billing records.`}
    >
      <Clause n="1" title="What we process">
        <p><b>Account data:</b> your name, work email address, phone number, job title, account status, whether your email is verified, and whether multi-factor authentication is enabled.</p>
        <p><b>Security data:</b> a hashed password (never the password itself), hashed session and reset tokens, sign-in timestamps, and hashed rate-limit keys derived from your network address. Recovery codes and multi-factor secrets are stored encrypted or hashed.</p>
        <p><b>Workspace content:</b> the tickets, assets, projects, documents, invoices and other records your organisation creates, including any files you attach. This content belongs to your organisation, not to us.</p>
        <p><b>Audit records:</b> who changed what and when. Every mutation writes an audit entry; this is a security feature and cannot be switched off per user.</p>
        <p><b>Billing data:</b> your plan, subscription period and payment references. Card details are entered on Paystack's own checkout and are never received or stored by this application.</p>
      </Clause>

      <Clause n="2" title="Why we process it">
        <p>To provide the service you asked for: authenticating you, isolating your organisation's records from every other tenant, sending the notifications and reports you configure, taking payment, and keeping an audit trail so changes are attributable.</p>
        <p>We do not sell personal data, and we do not use your workspace content to train models. The in-product assistant computes its answers from your own records inside your workspace; nothing is sent to an external model provider.</p>
      </Clause>

      <Clause n="3" title="Who else is involved">
        <p>We use a small number of providers strictly to operate the service:</p>
        <p><b>Paystack</b> — card and bank payments, and payment verification. <b>Resend</b> — transactional email such as verification, invitations, password resets and scheduled reports. <b>Vercel</b> — application hosting. <b>Aiven</b> — managed PostgreSQL database hosting.</p>
        <p>Each receives only what its function requires. Because these providers process data outside Nigeria, transfers rely on their contractual and technical safeguards.</p>
      </Clause>

      <Clause n="4" title="How long we keep it">
        <p>Operational records are retained for as long as your workspace is active, because deleting them would break the audit trail your organisation relies on. Removing a user therefore suspends their access rather than erasing history attributable to them.</p>
        <p>Technical records are purged automatically: expired sessions and authentication tokens after one day past expiry, rate-limit counters after two days, monitoring ingestion identifiers after seven days, and sent email records after thirty days.</p>
        <p>Attachments you remove are deleted immediately, together with the stored file.</p>
      </Clause>

      <Clause n="5" title="Your rights and how to exercise them">
        <p>You may request a copy of your data, ask for correction, or ask for erasure. Signed-in users can export their own account data from Account settings; workspace owners can export the whole workspace and can raise a formal export or erasure request from Admin → Privacy, which is routed to an administrator for review and recorded in the audit trail.</p>
        <p>Erasure requests may be refused in part where retention is required for security, accounting or legal reasons — the reason is recorded against the request rather than silently ignored.</p>
      </Clause>

      <Clause n="6" title="How we protect it">
        <p>Passwords are hashed with a memory-hard function. Sessions use opaque tokens in HttpOnly cookies with CSRF protection and idle expiry. Database connections verify TLS certificates. Every record access is scoped to a tenant and permission-checked in the data layer, not merely hidden in the interface. Attachments are type-checked by content, size-limited, and served only to authorised members with download auditing.</p>
        <p>No system is perfectly secure. If a breach affects your personal data, we will notify your workspace administrator and the relevant authority as the law requires.</p>
      </Clause>

      <Clause n="7" title="Cookies">
        <p>We set only strictly necessary cookies: a session cookie to keep you signed in and a CSRF cookie to protect against cross-site request forgery. There are no advertising or cross-site tracking cookies, so no consent banner is required for these.</p>
      </Clause>

      <Clause n="8" title="Changes to this notice">
        <p>We update this page when the service changes and revise the date above. Material changes affecting how your data is used are communicated to workspace administrators.</p>
      </Clause>
    </LegalLayout>
  );
}
