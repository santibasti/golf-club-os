"use client";
import React, { useEffect, useId, useState } from "react";
import Link from "next/link";
import * as Icons from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { X, ArrowUpRight } from "lucide-react";
import { initials } from "@/lib/format";

export const cn = (...a: Parameters<typeof clsx>) => twMerge(clsx(...a));
export const CHART = { forest: "#0F3D2E", emerald: "#1F7A5A", gold: "#B8975A", sage: "#8DB8A2", charcoal: "#4A504E", sand: "#D9C089", clay: "#B5654A", sky: "#5B8DB0" };
export const CHART_SEQ = [CHART.forest, CHART.gold, CHART.emerald, CHART.sky, CHART.clay, CHART.sage, CHART.sand, CHART.charcoal];

export function Icon({ name, className }: { name: string; className?: string }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name] ?? Icons.Circle;
  return <C className={className} />;
}

/* ------------------------------- buttons ------------------------------- */
type BtnVariant = "primary" | "gold" | "outline" | "ghost" | "danger" | "soft";
export function Button({ variant = "primary", size = "md", className, loading, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg" | "icon"; loading?: boolean }) {
  const v: Record<BtnVariant, string> = {
    primary: "bg-gradient-to-b from-forest-700 to-forest text-white shadow-[0_1px_2px_rgba(6,32,26,.25),inset_0_1px_0_rgba(255,255,255,.12)] hover:from-forest hover:to-forest-900",
    gold: "bg-gradient-to-b from-gold-500 to-gold-600 text-white shadow-[0_1px_2px_rgba(124,98,52,.35),inset_0_1px_0_rgba(255,255,255,.2)] hover:from-gold-600 hover:to-gold-700",
    outline: "border border-charcoal-200 bg-white text-charcoal shadow-sm hover:border-charcoal-300 hover:bg-ivory-50",
    ghost: "text-charcoal-600 hover:bg-charcoal-100/70",
    danger: "bg-gradient-to-b from-[#B4473A] to-[#9C3326] text-white shadow-[0_1px_2px_rgba(120,30,20,.3),inset_0_1px_0_rgba(255,255,255,.12)] hover:from-[#9C3326] hover:to-[#842a1f]",
    soft: "bg-forest-50 text-forest hover:bg-forest-100",
  };
  const s = { sm: "h-8 gap-1.5 rounded-lg px-3 text-xs", md: "h-10 gap-2 rounded-lg px-4 text-sm", lg: "h-12 gap-2 rounded-xl px-6 text-[15px]", icon: "h-9 w-9 rounded-lg" }[size];
  return <button {...p} disabled={p.disabled || loading} className={cn("inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-all duration-150 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100", v[variant], s, className)} />;
}

/* -------------------------------- cards -------------------------------- */
export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={cn("rounded-2xl border border-line bg-white/95 shadow-card", className)}>{children}</div>;
}
export function CardHeader({ title, sub, action, className }: { title: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5", className)}><div className="min-w-0"><h3 className="font-sans text-[15px] font-semibold leading-tight tracking-tight text-forest">{title}</h3>{sub && <p className="mt-0.5 text-xs text-charcoal-500">{sub}</p>}</div>{action}</div>;
}

/* -------------------------------- badges -------------------------------- */
export type Tone = "neutral" | "green" | "gold" | "red" | "blue" | "amber" | "dark";
const TONES: Record<Tone, string> = { neutral: "bg-charcoal-100/80 text-charcoal-600", green: "bg-emerald-50 text-emerald-700", gold: "bg-gold-50 text-gold-700", red: "bg-[#FBEAE7] text-[#9C3326]", blue: "bg-[#E8F1F8] text-[#2C5F85]", amber: "bg-[#FFF3DC] text-[#8A5A00]", dark: "bg-forest text-white" };
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide", TONES[tone], className)}>{children}</span>;
}
const STATUS_TONE: Record<string, Tone> = {
  booked: "amber", confirmed: "blue", arrived: "gold", ready: "green", started: "dark", completed: "neutral", cancelled: "red", no_show: "red",
  active: "green", applicant: "amber", pending_approval: "amber", suspended: "red", expired: "red",
  unpaid: "amber", partial: "gold", paid: "green", refunded: "blue", written_off: "red", voided: "neutral",
  available: "green", reserved: "blue", assigned: "gold", on_course: "dark", returned: "amber", unavailable: "red", absent: "red", day_off: "neutral", off: "neutral",
  dispatched: "gold", in_use: "dark", inspection: "amber", maintenance: "red",
  scheduled: "neutral", in_progress: "gold", for_inspection: "amber", low: "neutral", normal: "blue", high: "amber", urgent: "red",
  open: "green", closed: "neutral", pending: "amber", settled: "green", good: "green", excellent: "green", fair: "amber", poor: "red",
  confirmed_ev: "blue", draft: "neutral", ongoing: "green", on_pace: "green", behind: "red", ahead: "blue", delayed: "red", not_started: "neutral", finished: "neutral", suspended_play: "red", waiting: "amber", served: "green", preparing: "amber", new: "blue", void: "red",
};
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = STATUS_TONE[status] ?? "neutral";
  return <Badge tone={tone}><span className={cn("h-1.5 w-1.5 rounded-full bg-current", tone === "dark" && "bg-gold-300")} />{label ?? status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</Badge>;
}

/* ------------------------------ page header ------------------------------ */
export function PageHeader({ title, sub, actions, icon }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode; icon?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-line/70 pb-5">
      <div className="flex min-w-0 items-center gap-3.5">
        {icon && <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-forest-700 to-forest-900 text-gold-300 shadow-[0_4px_12px_rgba(15,61,46,.25)]"><Icon name={icon} className="h-5 w-5" /></span>}
        <div className="min-w-0"><h1 className="truncate text-[1.6rem] font-semibold leading-tight text-forest sm:text-[1.9rem]">{title}</h1>{sub && <p className="mt-0.5 text-[13px] text-charcoal-500">{sub}</p>}</div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* --------------------------------- KPI --------------------------------- */
export function Kpi({ label, value, sub, icon, tone = "neutral", href, trend }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: string; tone?: "neutral" | "gold" | "red" | "green"; href?: string; trend?: React.ReactNode }) {
  const chip = tone === "gold" ? "bg-gold-50 text-gold-600" : tone === "red" ? "bg-[#FBEAE7] text-[#9C3326]" : tone === "green" ? "bg-emerald-50 text-emerald-700" : "bg-forest-50 text-forest";
  const body = (
    <Card className={cn("group relative h-full overflow-hidden p-4 transition-all duration-200", href && "hover:-translate-y-0.5 hover:shadow-lift")}>
      <span className={cn("absolute inset-x-0 top-0 h-0.5 opacity-0 transition-opacity group-hover:opacity-100", tone === "red" ? "bg-[#B4473A]" : "bg-gold")} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase leading-tight tracking-[.08em] text-charcoal-500">{label}</p>
        {icon && <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", chip)}><Icon name={icon} className="h-4 w-4" /></span>}
      </div>
      <p className="mt-2 font-display text-[1.65rem] font-semibold leading-none tabular-nums text-forest">{value}</p>
      {(sub || trend) && <p className="mt-1.5 text-xs leading-snug text-charcoal-500">{sub} {trend}</p>}
      {href && <ArrowUpRight className="absolute bottom-3 right-3 h-4 w-4 text-charcoal-300 opacity-0 transition-opacity group-hover:opacity-100" />}
    </Card>
  );
  return href ? <Link href={href} className="block h-full rounded-2xl">{body}</Link> : body;
}

/* ------------------------------ form fields ------------------------------ */
export function Field({ label, error, hint, children, className, required }: { label: string; error?: string; hint?: string; children: React.ReactNode; className?: string; required?: boolean }) {
  const id = useId();
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-xs font-medium text-charcoal-600">{label}{required && <span className="text-[#A63D2F]"> *</span>}</label>
      {React.isValidElement(children) ? React.cloneElement(children as React.ReactElement<{ id?: string }>, { id }) : children}
      {hint && !error && <p className="text-xs text-charcoal-400">{hint}</p>}
      {error && <p role="alert" className="text-xs text-[#A63D2F]">{error}</p>}
    </div>
  );
}
const inputCls = "w-full rounded-lg border border-charcoal-200 bg-white px-3 py-2 text-sm text-charcoal shadow-[inset_0_1px_1px_rgba(35,40,39,.03)] transition-shadow placeholder:text-charcoal-300 hover:border-charcoal-300 focus:border-emerald focus:outline-none focus:ring-4 focus:ring-emerald/10 disabled:cursor-not-allowed disabled:bg-charcoal-100/60 disabled:text-charcoal-400";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) { return <input ref={ref} {...p} className={cn(inputCls, "h-10", className)} />; });
export function Select({ className, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select {...p} className={cn(inputCls, "h-10 pr-9", className)}>{children}</select>; }
export function Textarea({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...p} className={cn(inputCls, "min-h-[76px] py-2.5", className)} />; }

/* --------------------------------- modal --------------------------------- */
export function Modal({ open, onClose, title, children, footer, size = "md" }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; size?: "sm" | "md" | "lg" | "xl" }) {
  useEffect(() => { if (!open) return; const h = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", h); document.body.style.overflow = "hidden"; return () => { window.removeEventListener("keydown", h); document.body.style.overflow = ""; }; }, [open, onClose]);
  if (!open) return null;
  const w = { sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-3xl", xl: "sm:max-w-5xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex animate-fade items-end justify-center bg-forest-950/55 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className={cn("flex max-h-[94vh] w-full animate-sheet flex-col overflow-hidden rounded-t-3xl border border-line bg-white shadow-pop sm:max-h-[90vh] sm:rounded-2xl", w)}>
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-charcoal-200 sm:hidden" />
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3.5 sm:py-4"><h2 className="min-w-0 truncate font-sans text-[17px] font-semibold tracking-tight text-forest">{title}</h2><button aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-charcoal-400 transition-colors hover:bg-charcoal-100 hover:text-charcoal"><X className="h-5 w-5" /></button></div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line bg-ivory-50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------------------------- tabs ---------------------------------- */
export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: React.ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn("scroll-thin mb-5 overflow-x-auto pb-1", className)}>
      <div role="tablist" className="inline-flex min-w-full gap-1 rounded-xl border border-line bg-charcoal-100/50 p-1 sm:min-w-0">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} className={cn("flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-[13px] font-medium transition-all", value === t.id ? "bg-white text-forest shadow-[0_1px_3px_rgba(15,61,46,.12)] ring-1 ring-line" : "text-charcoal-500 hover:text-forest")}>
            {t.label}{t.count !== undefined && <span className={cn("min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold", value === t.id ? "bg-gold-50 text-gold-700" : "bg-charcoal-100 text-charcoal-500")}>{t.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------- tables --------------------------------- */
export interface Col<T> { key: string; header: React.ReactNode; render: (row: T) => React.ReactNode; align?: "right" | "center"; className?: string; sortValue?: (row: T) => string | number }
export function DataTable<T>({ columns, rows, rowKey, empty, onRowClick, className, maxRows, dense }: { columns: Col<T>[]; rows: T[]; rowKey: (r: T) => string; empty?: React.ReactNode; onRowClick?: (r: T) => void; className?: string; maxRows?: number; dense?: boolean }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [limit, setLimit] = useState(maxRows ?? 1e9);
  let data = rows;
  if (sort) { const c = columns.find((x) => x.key === sort.key); if (c?.sortValue) data = [...rows].sort((a, b) => { const x = c.sortValue!(a), y = c.sortValue!(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; }); }
  if (!rows.length) return <>{empty ?? <Empty title="No records" text="Nothing to show yet." />}</>;
  return (
    <div className={cn("scroll-thin overflow-x-auto", className)}>
      <table className="w-full min-w-max text-sm">
        <thead><tr className="border-b border-line bg-ivory-100/60 text-left text-[11px] font-semibold uppercase tracking-[.07em] text-charcoal-500">
          {columns.map((c) => <th key={c.key} className={cn("px-4 py-2.5 first:pl-5 last:pr-5", c.align === "right" && "text-right", c.align === "center" && "text-center")}>
            {c.sortValue ? <button className="inline-flex items-center gap-1 uppercase tracking-[.07em] hover:text-forest" onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: (s.dir * -1) as 1 | -1 } : { key: c.key, dir: 1 }))}>{c.header}<span className={cn("text-[10px]", sort?.key === c.key ? "text-gold-600" : "text-charcoal-300")}>{sort?.key === c.key ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span></button> : c.header}
          </th>)}
        </tr></thead>
        <tbody>
          {data.slice(0, limit).map((r) => (
            <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn("border-b border-line/60 transition-colors last:border-0", onRowClick ? "cursor-pointer hover:bg-gold-50/60" : "hover:bg-ivory-50/70")}>
              {columns.map((c) => <td key={c.key} className={cn(dense ? "px-4 py-2" : "px-4 py-3", "first:pl-5 last:pr-5", c.align === "right" && "text-right tabular-nums", c.align === "center" && "text-center", c.className)}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > limit && <div className="border-t border-line p-3 text-center"><Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + 50)}>Show more ({data.length - limit} remaining)</Button></div>}
    </div>
  );
}

/* ------------------------------ states & misc ------------------------------ */
export function Empty({ title, text, action, icon = "Inbox" }: { title: string; text?: string; action?: React.ReactNode; icon?: string }) {
  return <div className="flex flex-col items-center justify-center px-6 py-12 text-center"><span className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-forest-50 to-ivory-100 text-forest/60 ring-1 ring-line"><Icon name={icon} className="h-6 w-6" /></span><p className="font-semibold text-forest">{title}</p>{text && <p className="mt-1 max-w-sm text-sm leading-relaxed text-charcoal-500">{text}</p>}{action && <div className="mt-4">{action}</div>}</div>;
}
export function Denied({ perm, what }: { perm?: string; what?: string }) {
  return <Card><Empty icon="Lock" title="Not available for your role" text={`${what ?? "This action"} requires permission${perm ? ` "${perm}"` : ""}. Use the role switcher in the top bar to try another demo role.`} /></Card>;
}
export function Notice({ tone = "info", children, className }: { tone?: "info" | "warn" | "error" | "ok"; children: React.ReactNode; className?: string }) {
  const t = { info: "border-[#CFE1EE] bg-[#F1F7FB] text-[#2C5F85]", warn: "border-[#F1DDAA] bg-[#FFF9EA] text-[#6F4B00]", error: "border-[#F3CFC8] bg-[#FDF3F1] text-[#8C3025]", ok: "border-emerald-100 bg-emerald-50 text-emerald-700" }[tone];
  return <div className={cn("flex gap-2 rounded-xl border px-3.5 py-2.5 text-sm leading-snug", t, className)}>{children}</div>;
}
export function Avatar({ name, seed = 0, size = 36 }: { name: string; seed?: number; size?: number }) {
  const g = ["from-forest-700 to-forest-900", "from-emerald-600 to-forest-800", "from-gold-600 to-gold-700", "from-[#3F7AA3] to-[#2C5F85]", "from-[#7C5A8C] to-[#5B3F6B]", "from-[#B27200] to-[#8A5A00]", "from-charcoal-500 to-charcoal"];
  return <span style={{ width: size, height: size, fontSize: size * 0.38 }} className={cn("inline-grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-semibold text-white ring-2 ring-white/70", g[seed % g.length])} aria-hidden>{initials(name)}</span>;
}
export function Progress({ value, tone = "green" }: { value: number; tone?: "green" | "gold" | "red" }) {
  const c = { green: "bg-emerald", gold: "bg-gold", red: "bg-[#A63D2F]" }[tone];
  return <div className="h-2 w-full overflow-hidden rounded-full bg-charcoal-100"><div className={cn("h-full rounded-full transition-all duration-500", c)} style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} /></div>;
}
export function Skeleton({ className }: { className?: string }) { return <div className={cn("skeleton", className)} />; }
export function ConfirmButton({ children, onConfirm, title, message, confirmLabel = "Confirm", variant = "danger", size = "sm", disabled, className }: { children: React.ReactNode; onConfirm: () => void; title: string; message: React.ReactNode; confirmLabel?: string; variant?: BtnVariant; size?: "sm" | "md"; disabled?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  return (<>
    <Button variant={variant} size={size} disabled={disabled} className={className} onClick={() => setOpen(true)}>{children}</Button>
    <Modal open={open} onClose={() => setOpen(false)} title={title} size="sm" footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button variant={variant} onClick={() => { setOpen(false); onConfirm(); }}>{confirmLabel}</Button></>}><div className="text-sm leading-relaxed text-charcoal-600">{message}</div></Modal>
  </>);
}
export function KV({ k, v }: { k: string; v: React.ReactNode }) { return <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm"><span className="text-charcoal-500">{k}</span><span className="text-right font-medium text-charcoal">{v}</span></div>; }
export function DemoBadge({ className }: { className?: string }) { return <span className={cn("inline-flex items-center gap-1 rounded-full bg-gold-50 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-gold-700 ring-1 ring-gold-300/60", className)}><Icons.FlaskConical className="h-3 w-3" />Demo data</span>; }

/** Reusable prompt dialog: a reason/value capture with validation. */
export function PromptDialog({ open, onClose, title, label, onSubmit, submitLabel = "Submit", minLen = 3, multiline = true, description, tone = "primary" }: { open: boolean; onClose: () => void; title: string; label: string; onSubmit: (v: string) => void; submitLabel?: string; minLen?: number; multiline?: boolean; description?: React.ReactNode; tone?: BtnVariant }) {
  const [v, setV] = useState(""); const [err, setErr] = useState<string>();
  useEffect(() => { if (open) { setV(""); setErr(undefined); } }, [open]);
  const go = () => { if (v.trim().length < minLen) { setErr(`${label} is required (min ${minLen} characters).`); return; } onSubmit(v.trim()); onClose(); };
  return <Modal open={open} onClose={onClose} title={title} size="sm" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant={tone} onClick={go}>{submitLabel}</Button></>}>
    {description && <div className="mb-3 text-sm text-charcoal-600">{description}</div>}
    <Field label={label} error={err} required>{multiline ? <Textarea value={v} onChange={(e) => setV(e.target.value)} autoFocus /> : <Input value={v} onChange={(e) => setV(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && go()} />}</Field>
  </Modal>;
}
export function useToggle(init = false) { const [o, s] = useState(init); return [o, () => s(true), () => s(false)] as const; }
