'use client';
import { Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { parseRecipients } from '@/lib/recipients';

export interface RecipientState {
  emails: string[];
  invalid: number;
  duplicates: number;
}
const MAX_BYTES = 5 * 1024 * 1024;

export function RecipientsField({ value, onChange, onError, error }: { value: RecipientState; onChange: (v: RecipientState) => void; onError: (m: string) => void; error?: string }) {
  const file = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);

  const merge = (text: string): boolean => {
    const parsed = parseRecipients(text);
    const existing = new Set(value.emails);
    const fresh = parsed.valid.filter((e) => !existing.has(e));
    onChange({ emails: [...value.emails, ...fresh], invalid: value.invalid + parsed.invalid.length, duplicates: value.duplicates + parsed.duplicates + (parsed.valid.length - fresh.length) });
    return parsed.valid.length > 0 || parsed.invalid.length > 0;
  };
  const commit = () => {
    if (!draft.trim()) return;
    if (!merge(draft)) onError('That does not look like an email address');
    setDraft('');
  };
  const remove = (email: string) => onChange({ ...value, emails: value.emails.filter((e) => e !== email) });

  async function upload(f: File | undefined) {
    if (!f) return;
    if (!/\.(csv|txt)$/i.test(f.name) && !/^text\//.test(f.type)) return onError('Please upload a .csv or .txt file');
    if (f.size > MAX_BYTES) return onError('File is larger than 5 MB');
    const before = value.emails.length;
    const parsed = parseRecipients(await f.text());
    const existing = new Set(value.emails);
    const fresh = parsed.valid.filter((e) => !existing.has(e));
    onChange({ emails: [...value.emails, ...fresh], invalid: value.invalid + parsed.invalid.length, duplicates: value.duplicates + parsed.duplicates });
    if (fresh.length === 0 && before === 0) onError('No valid email addresses found in that file');
  }

  const shown = expanded ? value.emails : value.emails.slice(0, 3);
  const hidden = value.emails.length - shown.length;
  const chip = 'inline-flex items-center gap-1 rounded-full border border-brand/60 bg-brand/10 px-2.5 py-0.5 text-xs text-fg';
  return (
    <div>
      <div className="flex items-center gap-2 border-b border-line pb-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {shown.map((e) => (
            <span key={e} className={chip}>
              {e}
              <button type="button" onClick={() => remove(e)} aria-label={`Remove ${e}`} className="text-muted hover:text-rose-500">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {hidden > 0 && (
            <button type="button" onClick={() => setExpanded(true)} className={chip} aria-label={`Show ${hidden} more recipients`}>
              +{hidden}
            </button>
          )}
          {expanded && value.emails.length > 3 && (
            <button type="button" onClick={() => setExpanded(false)} className="text-xs text-muted hover:text-fg">
              show less
            </button>
          )}
          <input
            aria-label="Recipients"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (['Enter', ',', ' ', ';'].includes(e.key) && draft.trim()) {
                e.preventDefault();
                commit();
              } else if (e.key === 'Backspace' && !draft && value.emails.length) remove(value.emails[value.emails.length - 1] as string);
            }}
            onBlur={commit}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text');
              if (/[\s,;]/.test(text.trim())) {
                e.preventDefault();
                merge(text);
              }
            }}
            placeholder={value.emails.length ? '' : 'recipient@example.com'}
            className="min-w-[160px] flex-1 bg-transparent py-1 text-sm placeholder:text-muted focus:outline-none"
          />
        </div>
        <button type="button" onClick={() => file.current?.click()} className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-brand hover:underline">
          <Upload className="h-4 w-4" aria-hidden /> Upload List
        </button>
        <input
          ref={file}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="sr-only"
          aria-label="Lead file (CSV or TXT)"
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {value.emails.length > 0 && (
        <p className="mt-1.5 text-xs" aria-live="polite">
          <span className="font-semibold text-brand">
            {value.emails.length.toLocaleString()} valid email address{value.emails.length === 1 ? '' : 'es'} detected
          </span>
          {value.invalid > 0 && <span className="text-amber-600 dark:text-amber-400"> · {value.invalid} invalid skipped</span>}
          {value.duplicates > 0 && <span className="text-muted"> · {value.duplicates} duplicate{value.duplicates === 1 ? '' : 's'} removed</span>}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}
