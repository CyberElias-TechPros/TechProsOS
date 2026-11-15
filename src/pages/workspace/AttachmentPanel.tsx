/**
 * Attachments for any record that supports them (ticket, asset, document).
 *
 * The upload/download endpoints existed with full validation, tenant scoping and auditing, but
 * no page ever called them — so attaching a screenshot to a ticket was impossible. This panel is
 * the missing surface, shared by every detail page so the rules stay in one place.
 *
 * Client-side checks mirror the server (type, 3 MB, 10 files) purely to fail fast with a useful
 * message; the server re-validates including magic bytes. Never trust these alone.
 */
import { useRef, useState } from 'react';
import { useSessionCtx } from '../../platform/session';
import { useData } from '../../platform/store';
import { ATTACHMENT_MAX_COUNT, ATTACHMENT_MIMES, attachmentHref, removeAttachment, uploadAttachment } from '../../platform/actions';
import { Icon } from '../../components/icons';
import { toast } from '../../components/ui';
import { fmtDateTime } from '../../platform/util';
import { userName } from './lookups';

const ACCEPT = ATTACHMENT_MIMES.join(',');
const kb = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const iconFor = (mime: string) => mime.startsWith('image/') ? 'file' : mime === 'application/pdf' ? 'docs' : 'file';

export function AttachmentPanel({ entityId, canUpload, canManage }: { entityId: string; canUpload: boolean; canManage: boolean }) {
  const { ctx, user } = useSessionCtx();
  const data = useData(s => s.data);
  const mode = useData(s => s.mode);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const files = data.attachments.filter(a => a.entityId === entityId && a.tenantId === ctx.tenantId);
  const full = files.length >= ATTACHMENT_MAX_COUNT;

  const pick = async (list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    setBusy(true);
    try { await uploadAttachment(ctx, entityId, file); toast(`${file.name} attached`); }
    catch (error) { toast((error as Error).message, 'bad'); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ''; }
  };

  const remove = async (id: string, name: string) => {
    setBusy(true);
    try { await removeAttachment(ctx, id); toast(`${name} removed`); setConfirmId(null); }
    catch (error) { toast((error as Error).message, 'bad'); }
    finally { setBusy(false); }
  };

  return (
    <div className="card pad-lg stack">
      <div className="row between">
        <h3>Attachments</h3>
        <span className="xs faint">{files.length} / {ATTACHMENT_MAX_COUNT}</span>
      </div>

      {files.length === 0 && <p className="sm muted">No files attached yet. Add a screenshot, PDF or log excerpt to keep the evidence with the record.</p>}

      {files.length > 0 && (
        <ul className="stack" style={{ gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
          {files.map(f => {
            const href = attachmentHref(f.id);
            const mayRemove = canManage || f.createdBy === user.id;
            return (
              <li key={f.id} className="row between nowrap card flat card-tight" style={{ gap: 10 }}>
                <div className="row nowrap" style={{ gap: 9, minWidth: 0 }}>
                  <Icon name={iconFor(f.mime)} size={15} />
                  <div style={{ minWidth: 0 }}>
                    {href
                      ? <a className="b sm ellipsis" href={href} download={f.name} rel="noopener noreferrer">{f.name}</a>
                      : <span className="b sm ellipsis">{f.name}</span>}
                    <div className="xs faint">{kb(f.size)} · {userName(data, f.createdBy)} · {fmtDateTime(f.createdAt)}</div>
                  </div>
                </div>
                {mayRemove && (
                  confirmId === f.id ? (
                    <div className="row nowrap" style={{ gap: 6 }}>
                      <button className="btn sm" style={{ background: 'var(--bad)' }} disabled={busy} onClick={() => void remove(f.id, f.name)}>Remove</button>
                      <button className="btn sm ghost" disabled={busy} onClick={() => setConfirmId(null)}>Keep</button>
                    </div>
                  ) : (
                    <button className="btn sm ghost" disabled={busy} onClick={() => setConfirmId(f.id)} aria-label={`Remove ${f.name}`}>
                      <Icon name="x" size={14} />
                    </button>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canUpload && (
        <div className="stack" style={{ gap: 6 }}>
          <input ref={inputRef} type="file" accept={ACCEPT} style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }} id={`attach-${entityId}`}
            disabled={busy || full} onChange={e => void pick(e.target.files)} />
          <label htmlFor={`attach-${entityId}`} className="btn secondary sm"
            style={{ alignSelf: 'flex-start', cursor: busy || full ? 'not-allowed' : 'pointer', opacity: busy || full ? .45 : 1 }}
            aria-disabled={busy || full}>
            <Icon name="plus" size={14} /> {busy ? 'Uploading…' : full ? 'File limit reached' : 'Attach a file'}
          </label>
          <p className="xs faint">
            PDF, PNG, JPEG or plain text · up to 3 MB each · {ATTACHMENT_MAX_COUNT} per record.
            {mode === 'demo' && ' Demo files are held in memory and disappear on reload.'}
          </p>
        </div>
      )}
    </div>
  );
}
