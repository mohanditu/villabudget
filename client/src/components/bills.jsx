// Bill attachments (photos / PDFs) – drop zone, thumbnails, per-row attach button and viewer.
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { fileSize } from '../format.js';
import { BILL_ACCEPT, checkBillFile, isPdf } from '../upload.js';

const billUrl = (b, download) => `/api/bills/${b.fileId}${download ? '?download=1' : ''}`;
const billIsPdf = (b) => b.type === 'application/pdf';

/** Splits picked files into accepted ones and error messages. */
function screen(list) {
  const ok = [];
  const errors = [];
  for (const f of list) {
    const err = checkBillFile(f);
    if (err) errors.push(err); else ok.push(f);
  }
  return { ok, errors };
}

/** Dashed drop / choose area plus chips for the files waiting to be uploaded. */
export function BillDropzone({ files, onChange, onError, disabled }) {
  const [over, setOver] = useState(false);
  const add = (list) => {
    const { ok, errors } = screen([...list]);
    if (errors.length) onError?.(new Error(errors.join(' · ')));
    if (ok.length) onChange([...files, ...ok]);
  };
  return (
    <div>
      <label
        className={`dropzone ${over ? 'over' : ''} ${disabled ? 'disabled' : ''}`}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) add(e.dataTransfer.files); }}
      >
        <input type="file" hidden multiple accept={BILL_ACCEPT} disabled={disabled}
          onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
        <span className="dropzone-icon"><Icon name="upload" size={20} /></span>
        <span className="dropzone-text">
          Add bill photos or PDFs
          <span className="muted">Tap to take a photo or choose files, or drop them here · JPG, PNG, WEBP or PDF · up to 10 MB</span>
        </span>
      </label>
      {files.length > 0 && (
        <ul className="file-list">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="file-chip">
              <Icon name={isPdf(f) ? 'file' : 'image'} size={14} />
              <span className="name" title={f.name}>{f.name}</span>
              <span className="muted">{fileSize(f.size)}</span>
              <button type="button" className="link danger" disabled={disabled} aria-label={`Remove ${f.name}`}
                onClick={() => onChange(files.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Bills already saved on the expense being edited (click to view, × to delete). */
export function SavedBills({ bills, onOpen, onDelete, disabled }) {
  if (!bills?.length) return null;
  return (
    <ul className="file-list">
      {bills.map((b, i) => (
        <li key={b.fileId} className="file-chip saved">
          <Icon name={billIsPdf(b) ? 'file' : 'image'} size={14} />
          <button type="button" className="link" onClick={() => onOpen(i)} title="View"><span className="name">{b.name}</span></button>
          <span className="muted">{fileSize(b.size)}</span>
          <button type="button" className="link danger" disabled={disabled} aria-label={`Delete ${b.name}`} onClick={() => onDelete(b)}>
            <Icon name="x" size={14} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Small thumbnails in the expense list. */
export function BillThumbs({ bills, onOpen }) {
  return (bills ?? []).map((b, i) => (
    <button key={b.fileId} type="button" className={`bill-thumb ${billIsPdf(b) ? 'pdf' : ''}`} title={`View ${b.name}`} onClick={() => onOpen(i)}>
      {billIsPdf(b) ? <><Icon name="file" size={14} />PDF</> : <img src={billUrl(b)} alt={b.name} loading="lazy" />}
    </button>
  ));
}

/** Paperclip button that attaches files straight to an existing expense. */
export function AttachButton({ busy, onFiles, onError, label }) {
  return (
    <label className={`attach-btn ${busy ? 'busy' : ''}`} title={label} aria-label={label}>
      <input type="file" hidden multiple accept={BILL_ACCEPT} disabled={busy}
        onChange={(e) => {
          const { ok, errors } = screen([...e.target.files]);
          e.target.value = '';
          if (errors.length) onError?.(new Error(errors.join(' · ')));
          if (ok.length) onFiles(ok);
        }} />
      {busy ? <span className="spinner" /> : <Icon name="paperclip" size={16} />}
    </label>
  );
}

/** Full-size viewer: images inline, PDFs in the browser's PDF viewer. ← / → to move, Esc to close. */
export function BillViewer({ bills, index, title, onClose, onDelete }) {
  const [i, setI] = useState(index);
  const closeRef = useRef(null);
  const bill = bills[Math.min(i, bills.length - 1)];

  useEffect(() => {
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, bills.length - 1));
      if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bills.length, onClose]);

  if (!bill) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Bill: ${bill.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">
            <Icon name={billIsPdf(bill) ? 'file' : 'image'} size={18} />
            <span className="name" title={bill.name}>{bill.name}</span>
            <span className="muted small">{title ? `${title} · ` : ''}{i + 1} / {bills.length} · {fileSize(bill.size)}</span>
          </div>
          <div className="modal-actions">
            {bills.length > 1 && <>
              <button type="button" className="ghost icon-btn" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Previous bill"><Icon name="chevronLeft" size={16} /></button>
              <button type="button" className="ghost icon-btn" disabled={i === bills.length - 1} onClick={() => setI(i + 1)} aria-label="Next bill"><Icon name="chevronRight" size={16} /></button>
            </>}
            <a className="btn ghost" href={billUrl(bill)} target="_blank" rel="noopener noreferrer"><Icon name="external" size={15} /> Open</a>
            <a className="btn ghost" href={billUrl(bill, true)}><Icon name="download" size={15} /> Download</a>
            {onDelete && <button type="button" className="ghost danger" onClick={() => onDelete(bill)}><Icon name="trash" size={15} /> Delete</button>}
            <button type="button" ref={closeRef} className="ghost icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
          </div>
        </div>
        <div className="modal-body">
          {billIsPdf(bill)
            ? <iframe key={bill.fileId} src={billUrl(bill)} title={bill.name} />
            : <img key={bill.fileId} src={billUrl(bill)} alt={bill.name} />}
        </div>
      </div>
    </div>
  );
}
