import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, forwardRef } from "react";
import { X } from "lucide-react";
import { scoreLabel, type ScoreLabel } from "@/domain/scoring";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "brand" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-2 active:bg-accent-2",
  brand: "bg-brand text-brand-ink hover:bg-brand-2 active:bg-brand-2",
  secondary: "bg-surface-2 text-ink hover:bg-surface-3 active:bg-surface-3",
  ghost: "bg-transparent text-ink hover:bg-surface-2 active:bg-surface-2",
  danger: "bg-danger text-danger-ink hover:opacity-90",
};
const SIZE: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-full gap-1.5",
  md: "h-11 px-4 text-[15px] rounded-full gap-2",
  lg: "h-14 px-6 text-lg rounded-full gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  full?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "secondary", size = "md", full, className, ...rest }, ref) {
  return (
    <button
      ref={ref}
      className={cx(
        "inline-flex items-center justify-center font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none select-none",
        VARIANT[variant],
        SIZE[size],
        full && "w-full",
        className,
      )}
      {...rest}
    />
  );
});

export function IconButton({ label, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx("inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 active:bg-surface-3 disabled:opacity-40", className)}
      {...rest}
    />
  );
}

export const Field = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }>(function Field({ label, hint, className, id, ...rest }, ref) {
  const inputId = id ?? rest.name;
  return (
    <label className="block" htmlFor={inputId}>
      {label && <span className="mb-1.5 block text-sm font-medium text-ink-2">{label}</span>}
      <input
        ref={ref}
        id={inputId}
        className={cx("h-12 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-base text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none", className)}
        {...rest}
      />
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
});

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={cx("block w-full rounded-card bg-surface text-left shadow-card", onClick && "active:bg-surface-2", className)}>
      {children}
    </Tag>
  );
}

export function Section({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("px-4", className)}>
      {(title || action) && (
        <div className="mb-2 flex items-end justify-between">
          {title && <h2 className="text-lg font-bold tracking-tight">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
  return (
    <div role="tablist" className={cx("inline-flex rounded-full bg-surface-2 p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx("h-8 rounded-full px-3 text-sm font-semibold transition-colors", o.value === value ? "bg-surface text-ink shadow-card" : "text-ink-2")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, children, onClick, className }: { active?: boolean; children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
        active ? "border-brand bg-brand text-brand-ink" : "border-line-strong bg-surface text-ink hover:bg-surface-2",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Avatar({ name, color, size = 36, className }: { name: string; color: string; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className={cx("inline-grid shrink-0 place-items-center rounded-full font-bold text-white", className)}
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  );
}

export function StatTile({ label, value, sub, tone, className }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad" | "neutral"; className?: string }) {
  return (
    <div className={cx("rounded-card bg-surface p-3.5 shadow-card", className)}>
      <div className="text-[13px] font-medium text-ink-2">{label}</div>
      <div className={cx("display numeric mt-1 text-[28px]", tone === "good" && "text-birdie", tone === "bad" && "text-triple")}>{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-3">{sub}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-3 text-ink-3">{icon}</div>}
      <h3 className="text-lg font-bold">{title}</h3>
      {body && <p className="mt-1 max-w-xs text-sm text-ink-2">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const SCORE_CLASS: Record<ScoreLabel, string> = {
  ace: "bg-ace text-white rounded-[4px] rotate-0",
  eagle: "bg-eagle text-white rounded-full",
  birdie: "bg-birdie text-white rounded-full",
  par: "bg-transparent text-ink",
  bogey: "bg-bogey text-ink rounded-[6px]",
  double: "bg-double text-ink rounded-[6px]",
  triple: "bg-triple text-white rounded-[6px]",
  unscored: "bg-transparent text-ink-3",
};

export function ScoreCell({ strokes, par, size = 30, className }: { strokes: number; par: number; size?: number; className?: string }) {
  const label = scoreLabel(strokes, par);
  return (
    <span
      title={label}
      className={cx("numeric inline-grid place-items-center font-bold", SCORE_CLASS[label], className)}
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {strokes > 0 ? strokes : "–"}
    </span>
  );
}

export function Sheet({ open, onClose, title, children, tall }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; tall?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className={cx("relative w-full max-w-[480px] rounded-t-sheet bg-surface shadow-card safe-bottom", tall ? "max-h-[92dvh]" : "max-h-[80dvh]", "flex flex-col")}>
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-surface-3 absolute left-1/2 top-2 -translate-x-1/2" />
          <h2 className="mt-2 text-lg font-bold">{title}</h2>
          <IconButton label="Close" onClick={onClose} className="mt-2 -mr-2">
            <X size={20} />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-4 pb-4">{children}</div>
      </div>
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
      <div className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-bg shadow-card">{message}</div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx("inline-block h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-accent", className)} aria-label="Loading" />;
}

export function PageHeader({ title, back, right, sub }: { title: ReactNode; back?: () => void; right?: ReactNode; sub?: ReactNode }) {
  return (
    <header className="safe-top sticky top-0 z-20 bg-bg/90 backdrop-blur">
      <div className="flex h-14 items-center gap-1 px-2">
        {back && (
          <IconButton label="Back" onClick={back}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </IconButton>
        )}
        <div className={cx("min-w-0 flex-1", !back && "pl-2")}>
          <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>
          {sub && <div className="truncate text-xs text-ink-3">{sub}</div>}
        </div>
        {right}
      </div>
    </header>
  );
}
