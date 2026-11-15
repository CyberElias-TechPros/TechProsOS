/**
 * Public terms of service. Describes the behaviour the product actually implements — prepaid
 * 32-day periods, 14-day trial, write suspension on lapse with exports preserved, plan seat and
 * client allowances — rather than aspirational commercial promises.
 */
import { Clause, LEGAL_ENTITY, LEGAL_TRADING, LegalLayout } from './LegalLayout';

export default function Terms() {
  return (
    <LegalLayout
      title="Terms of service"
      intro={`These terms govern use of TechPros One, operated by ${LEGAL_ENTITY} (trading as ${LEGAL_TRADING}), a company registered in Nigeria. By creating a workspace you accept them on behalf of your organisation. If you are accepting for an organisation, you confirm you have authority to do so.`}
    >
      <Clause n="1" title="Your account">
        <p>You must provide accurate details and verify your email address before the workspace becomes usable. Keep your credentials confidential; you are responsible for activity under your account. We recommend enabling multi-factor authentication, which is available in Account settings.</p>
        <p>Workspace administrators control who is invited and what each role may do. Invitations expire after seven days and can be revoked. Only an owner may grant ownership, and the last remaining owner cannot be removed without transferring ownership first.</p>
      </Clause>

      <Clause n="2" title="Your data belongs to you">
        <p>Your organisation owns the records it creates. We process them only to provide the service, as described in the privacy notice. You can export your workspace at any time, including after a subscription lapses.</p>
        <p>You are responsible for having a lawful basis to store the personal data you enter — for example employee or client details — and for telling those people you use this system.</p>
      </Clause>

      <Clause n="3" title="Plans, trials and payment">
        <p>New workspaces start on a fourteen-day trial. Paid plans are billed in Nigerian naira and are prepaid: a verified payment extends the subscription period by thirty-two days. Prices shown exclude any applicable taxes, which are stated at checkout.</p>
        <p>Each plan includes a stated number of user seats and, for provider plans, a number of active client workspaces. A pending invitation reserves a seat. If you reach an allowance you can free a slot or upgrade; we will not silently bill you for exceeding it.</p>
        <p>Payments are processed by Paystack. Entitlements change only after the payment is verified server-side — never on the strength of a browser redirect.</p>
      </Clause>

      <Clause n="4" title="What happens if a subscription lapses">
        <p>When a trial or prepaid period ends, the workspace becomes read-only for operational changes: you can still sign in, read records, run reports and export your data, but creating or editing operational records is paused until you subscribe. We do not delete your data for non-payment.</p>
      </Clause>

      <Clause n="5" title="Acceptable use">
        <p>Do not use the service to break the law, infringe rights, or store content you have no right to store. Do not attempt to access another tenant's records, defeat permission checks, probe or disrupt the service, resell access without agreement, or upload malicious files.</p>
        <p>Attachments are limited to PDF, PNG, JPEG and plain-text files of up to 3 MB, ten per record, and are checked by content. We may remove material that breaches these terms and may suspend a workspace for serious or repeated breach.</p>
      </Clause>

      <Clause n="6" title="Availability and support">
        <p>We work to keep the service available but do not promise uninterrupted operation. Scheduled jobs, email delivery and payment settlement depend on third-party providers. Where a service-level agreement applies to your plan, that agreement takes precedence over this clause.</p>
        <p>Support is provided through your workspace administrator or the support contact published for your plan.</p>
      </Clause>

      <Clause n="7" title="Our responsibility">
        <p>The service is provided with reasonable skill and care. We are not liable for indirect or consequential loss, loss of profit, or loss arising from data you entered inaccurately. Nothing here excludes liability that cannot lawfully be excluded.</p>
        <p>You are responsible for the accuracy of tax treatment on invoices you raise. The application applies the VAT and withholding rates you select; it does not determine your tax liability or file returns for you.</p>
      </Clause>

      <Clause n="8" title="Ending the agreement">
        <p>You may stop using the service at any time and export your data first. We may end or suspend the agreement for material breach, or discontinue the service with reasonable notice, in which case we will give you the opportunity to export.</p>
      </Clause>

      <Clause n="9" title="Governing law">
        <p>These terms are governed by the laws of the Federal Republic of Nigeria, and the Nigerian courts have jurisdiction. If a clause is unenforceable the rest continues to apply.</p>
      </Clause>
    </LegalLayout>
  );
}
