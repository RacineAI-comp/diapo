import type { ReactNode } from 'react';
import { Icon } from '../ui/Icon';

// Small, consistent inspector building blocks shared by every panel.

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="ins-section">
      {title && <h4 className="ins-title">{title}</h4>}
      {children}
    </section>
  );
}

export function Row({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="ins-row">
      {label && <span className="ins-label">{label}</span>}
      <div className="ins-control">{children}</div>
    </div>
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <span className="ins-number">
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
      {suffix && <i>{suffix}</i>}
    </span>
  );
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  format,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (n: number) => string;
}) {
  return (
    <div className="ins-slider">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="ins-slider-val">{format ? format(value) : value}</span>
    </div>
  );
}

export interface SegOption<T extends string> {
  value: T;
  icon?: string;
  label?: string;
  title?: string;
}
export function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | undefined;
  options: SegOption<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="ins-seg" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          className={`ins-seg-btn${value === o.value ? ' is-active' : ''}`}
          title={o.title || o.label}
          aria-label={o.title || o.label}
          onClick={() => onChange(o.value)}
        >
          {o.icon ? <Icon name={o.icon} /> : o.label}
        </button>
      ))}
    </div>
  );
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (b: boolean) => void }) {
  return (
    <button className={`ins-check${checked ? ' is-on' : ''}`} onClick={() => onChange(!checked)} aria-pressed={checked}>
      <Icon name={checked ? 'check_box' : 'check_box_outline_blank'} />
      <span>{label}</span>
    </button>
  );
}
