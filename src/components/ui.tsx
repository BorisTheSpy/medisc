import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, forwardRef } from "react";
import { X, TrendingUp, TrendingDown } from "lucide-react";
import { scoreLabel, type ScoreLabel } from "@/domain/scoring";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "brand" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-live text-on-live hover:bg-live-2 active:bg-live-2",
  brand: "bg-ink text-on-live hover:bg-white active:bg-white",
  secondary: "bg-surface-2 text-ink border border-line-strong hover:bg-surface-3 active:bg-surface-3",
  ghost: "bg-transparent text-ink hover:bg-surface-2 active:bg-surface-2",
  danger: "bg-danger text-danger-ink hover:opacity-90",
};
const SIZE: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[12px] font-bold rounded-[39px] gap-1.5",
  md: "h-11 px-5 text-[13px] font-bold rounded-[39px] gap-2",
  lg: "h-14 px-6 text-[15px] font-bold rounded-[39px] gap-2",
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
      className={cx("inline-flex items-center justify-center transition-colors duration-150 ease select-none disabled:opacity-40 disabled:pointer-events-none", VARIANT[variant], SIZE[size], full && "w-full", className)}
      {...rest}
    />
  );
});

export function IconButton({ label, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} className={cx("inline-flex h-10 w-10 items-center justify-center rounded-[39px] text-ink-2 hover:bg-surface-2 active:bg-surface-3 disabled:opacity-40", className)} {...rest} />
  );
}

export const Field = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }>(function Field({ label, hint, className, id, ...rest }, ref) {
  const inputId = id ?? rest.name;
  return (
    <label className="block" htmlFor={inputId}>
      {label && <span className="label mb-2 block text-ink-2">{label}</span>}
      <input
        ref={ref}
        id={inputId}
        className={cx("h-12 w-full rounded-[6px] border border-line-strong bg-surface px-3.5 text-[15px] font-semibold text-ink placeholder:text-ink-3 placeholder:font-medium focus:border-live focus:outline-none", className)}
        {...rest}
      />
      {hint && <span className="mt-1.5 block text-[12px] font-medium text-ink-3">{hint}</span>}
    </label>
  );
});

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={cx("block w-full rounded-[14px] bg-surface text-left", onClick && "active:bg-surface-2", className)}>
      {children}
    </Tag>
  );
}

export function Section({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("px-[11px]", className)}>
      {(title || action) && (
        <div className="mb-[11px] flex items-end justify-between px-[11px]">
          {title && <h2 className="display text-[26px] text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
  return (
    <div role="tablist" className={cx("inline-flex rounded-[39px] border border-line-strong bg-surface p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx("label h-8 rounded-[39px] px-3.5 transition-colors duration-150 ease", o.value === value ? "bg-live text-on-live" : "text-ink-2")}
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
        "label inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[39px] border px-3.5 transition-colors duration-150 ease",
        active ? "border-live bg-live text-on-live" : "border-line-strong bg-transparent text-ink hover:bg-surface-2",
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
  void color;
  return (
    <span aria-hidden className={cx("inline-grid shrink-0 place-items-center rounded-[6px] border border-line-strong bg-surface-2 font-bold text-ink", className)} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials}
    </span>
  );
}

/** A stat with its value in the display voice. `trend` renders a small direction beside the value. */
export function StatTile({ label, value, sub, tone, trend, className }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad" | "neutral"; trend?: "up" | "down" | "flat" | null; className?: string }) {
  return (
    <div className={cx("rounded-[6px] bg-surface p-[11px]", className)}>
      <div className="label text-ink-3">{label}</div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={cx("display numeric text-[30px]", tone === "good" && "text-birdie", tone === "bad" && "text-triple")}>{value}</span>
        {trend && trend !== "flat" && (trend === "up" ? <TrendingUp size={14} className="text-live" aria-label="trending up" /> : <TrendingDown size={14} className="text-triple" aria-label="trending down" />)}
      </div>
      {sub && <div className="mt-1.5 text-[12px] font-medium text-ink-3">{sub}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-11 text-center">
      {icon && <div className="mb-3 text-live">{icon}</div>}
      <h3 className="display text-[22px]">{title}</h3>
      {body && <p className="mt-3 max-w-xs text-[14px] font-medium text-ink-2">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* Score chips: under par is mint, par is quiet, over par is off-white, worse is filled. Amber never colours a score. */
const SCORE_CLASS: Record<ScoreLabel, string> = {
  ace: "bg-birdie text-bg rounded-[6px] ring-2 ring-inset ring-bg",
  eagle: "bg-birdie text-bg rounded-[6px] ring-2 ring-inset ring-bg/40",
  birdie: "bg-birdie text-bg rounded-[6px]",
  par: "bg-transparent text-ink border border-line-strong rounded-[6px]",
  bogey: "bg-transparent text-ink border-2 border-ink rounded-[6px]",
  double: "bg-ink text-bg rounded-[6px]",
  triple: "bg-triple text-on-live rounded-[6px]",
  unscored: "bg-transparent text-ink-3 border border-line rounded-[6px]",
};

export function ScoreCell({ strokes, par, size = 30, className }: { strokes: number; par: number; size?: number; className?: string }) {
  const label = scoreLabel(strokes, par);
  return (
    <span title={label} className={cx("numeric inline-grid place-items-center font-bold", SCORE_CLASS[label], className)} style={{ width: size, height: size, fontSize: size * 0.46 }}>
      {strokes > 0 ? strokes : "–"}
    </span>
  );
}

export function Sheet({ open, onClose, title, children, tall }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; tall?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={cx("relative w-full max-w-[480px] rounded-t-[14px] border-t border-live bg-surface safe-bottom", tall ? "max-h-[92dvh]" : "max-h-[80dvh]", "flex flex-col")}>
        <div className="flex items-center justify-between px-[22px] pt-[22px] pb-[11px]">
          <h2 className="display text-[26px]">{title}</h2>
          <IconButton label="Close" onClick={onClose} className="-mr-2">
            <X size={20} />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-[22px] pb-[22px]">{children}</div>
      </div>
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
      <div className="rounded-[39px] bg-live px-[22px] py-[11px] text-[13px] font-bold text-on-live">{message}</div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx("inline-block h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-live", className)} aria-label="Loading" />;
}

export function PageHeader({ title, back, right, sub }: { title: ReactNode; back?: () => void; right?: ReactNode; sub?: ReactNode }) {
  return (
    <header className="safe-top sticky top-0 z-20 bg-bg/95 backdrop-blur">
      <div className="flex min-h-14 items-center gap-1 px-[11px] py-[11px]">
        {back && (
          <IconButton label="Back" onClick={back}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </IconButton>
        )}
        <div className={cx("min-w-0 flex-1", !back && "pl-[11px]")}>
          <h1 className="display truncate pt-[3px] text-[30px] leading-none">{title}</h1>
          {sub && <div className="label mt-2 truncate text-ink-3">{sub}</div>}
        </div>
        {right}
      </div>
    </header>
  );
}
