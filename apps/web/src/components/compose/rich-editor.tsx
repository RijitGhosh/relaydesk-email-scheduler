'use client';
import clsx from 'clsx';
import { AlignCenter, AlignLeft, AlignRight, Bold, IndentDecrease, IndentIncrease, Italic, List, ListOrdered, Quote, Redo2, RemoveFormatting, Strikethrough, Type, Underline, Undo2 } from 'lucide-react';
import { useRef, useState } from 'react';

const ALIGNS = [
  { cmd: 'justifyLeft', icon: AlignLeft, label: 'Align left' },
  { cmd: 'justifyCenter', icon: AlignCenter, label: 'Align center' },
  { cmd: 'justifyRight', icon: AlignRight, label: 'Align right' },
] as const;

const SIZES = [
  { label: 'Small', value: '2' },
  { label: 'Normal', value: '3' },
  { label: 'Large', value: '5' },
  { label: 'Huge', value: '6' },
];

/** Lightweight rich-text editor (contentEditable). The HTML it emits is sanitised again on the server. */
export function RichEditor({ onChange, invalid }: { onChange: (html: string) => void; invalid?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [align, setAlign] = useState(0);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    if (!el.textContent?.trim() && !el.querySelector('img,hr')) el.innerHTML = '';
    onChange(el.innerHTML);
  };
  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    emit();
  };

  const Btn = ({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" aria-label={label} title={label} onMouseDown={(e) => e.preventDefault()} onClick={onClick} className="flex h-7 w-7 items-center justify-center rounded-md text-fg/80 hover:bg-surface2">
      {children}
    </button>
  );
  const Sep = () => <span className="mx-1 h-4 w-px bg-line" aria-hidden />;
  const AlignIcon = ALIGNS[align]?.icon ?? AlignLeft;

  return (
    <div className={clsx('rounded-xl bg-surface2 p-3', invalid && 'ring-1 ring-rose-400')}>
      <div role="toolbar" aria-label="Text formatting" className="mb-3 flex flex-wrap items-center gap-0.5 rounded-full bg-surface px-3 py-1.5">
        <Btn label="Undo" onClick={() => exec('undo')}>
          <Undo2 className="h-4 w-4" />
        </Btn>
        <Btn label="Redo" onClick={() => exec('redo')}>
          <Redo2 className="h-4 w-4" />
        </Btn>
        <Sep />
        <label className="flex items-center text-fg/80">
          <Type className="mx-1 h-4 w-4" aria-hidden />
          <select
            aria-label="Text size"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) exec('fontSize', e.target.value);
              e.target.value = '';
            }}
            className="w-6 cursor-pointer appearance-none bg-transparent text-transparent focus:outline-none"
          >
            <option value="" disabled>
              Size
            </option>
            {SIZES.map((s) => (
              <option key={s.value} value={s.value} className="text-fg">
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <Sep />
        <Btn label="Bold" onClick={() => exec('bold')}>
          <Bold className="h-4 w-4" />
        </Btn>
        <Btn label="Italic" onClick={() => exec('italic')}>
          <Italic className="h-4 w-4" />
        </Btn>
        <Btn label="Underline" onClick={() => exec('underline')}>
          <Underline className="h-4 w-4" />
        </Btn>
        <Sep />
        <Btn
          label={ALIGNS[align]?.label ?? 'Align'}
          onClick={() => {
            const next = (align + 1) % ALIGNS.length;
            setAlign(next);
            exec(ALIGNS[next]?.cmd ?? 'justifyLeft');
          }}
        >
          <AlignIcon className="h-4 w-4" />
        </Btn>
        <Sep />
        <Btn label="Numbered list" onClick={() => exec('insertOrderedList')}>
          <ListOrdered className="h-4 w-4" />
        </Btn>
        <Btn label="Bulleted list" onClick={() => exec('insertUnorderedList')}>
          <List className="h-4 w-4" />
        </Btn>
        <Btn label="Increase indent" onClick={() => exec('indent')}>
          <IndentIncrease className="h-4 w-4" />
        </Btn>
        <Btn label="Decrease indent" onClick={() => exec('outdent')}>
          <IndentDecrease className="h-4 w-4" />
        </Btn>
        <Btn label="Quote" onClick={() => exec('formatBlock', 'blockquote')}>
          <Quote className="h-4 w-4" />
        </Btn>
        <Btn label="Clear formatting" onClick={() => exec('removeFormat')}>
          <RemoveFormatting className="h-4 w-4" />
        </Btn>
        <Sep />
        <Btn label="Strikethrough" onClick={() => exec('strikeThrough')}>
          <Strikethrough className="h-4 w-4" />
        </Btn>
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label="Email body"
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Type Your Reply..."
        onInput={emit}
        onBlur={emit}
        onPaste={(e) => {
          e.preventDefault();
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
        }}
        className="editor min-h-[280px] px-2 py-1 text-sm leading-relaxed focus:outline-none"
      />
    </div>
  );
}
