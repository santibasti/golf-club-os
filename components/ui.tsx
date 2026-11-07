"use client";
import React, { useEffect, useId, useState } from "react";
import Link from "next/link";
import * as Icons from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { X } from "lucide-react";
import { initials } from "@/lib/format";

export const cn = (...a: Parameters<typeof clsx>) => twMerge(clsx(...a));
export const CHART = { forest: "#0F3D2E", emerald: "#1F7A5A", gold: "#B8975A", sage: "#8DB8A2", charcoal: "#4A504E", sand: "#D9C089", clay: "#B5654A", sky: "#5B8DB0" };
export const CHART_SEQ = [CHART.forest, CHART.gold, CHART.emerald, CHART.sky, CHART.clay, CHART.sage, CHART.sand, CHART.charcoal];

export function Icon({ name, className }: { name: string; className?: string }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name] ?? Icons.Circle;
  return <C className={className} />;
}

type BtnVariant = "primary" | "gold" | "outline" | "ghost" | "danger" | "soft";
export function Button({ variant = "primary", size = "md", className, loading, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg" | "icon"; loading?: boolean }) {
  const v: Record<BtnVariant, string> = {
    primary: "bg-forest text-white hover:bg-forest-700 shadow-sm", gold: "bg-gold text-white hover:bg-gold-600 shadow-sm", outline: "border border-charcoal-200 bg-white text-charcoal hover:bg-ivory-100",
    ghost: "text-charcoal-600 hover:bg-charcoal-100", danger: "bg-[#A63D2F] text-white hover:bg-[#8C3025]", soft: "bg-forest-50 text-forest hover:bg-forest-100",
  };
  const s = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base", icon: "h-9 w-9" }[size];
  return <button {...p} disabled={p.disabled || loading} className={cn("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50", v[variant], s, className)} />;
}

export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={cn("rounded-xl border border-charcoal-100 bg-white shadow-card", className)}>{children}</div>;
}
export function CardHeader({ title, sub, action, className }: { title: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-start justify-between gap-2 border-b border-charcoal-100 px-5 py-4", className)}><div><h3 className="text-base font-semibold text-forest">{title}</h3>{sub && <p className="mt-0.5 text-xs text-charcoal-500">{sub}</p>}</div>{action}</div>;
}

export type Tone = "neutral" | "green" | "gold" | "red" | "blue" | "amber" | "dark";
const TONES: Record<Tone, string> = { neutral: "bg-charcoal-100 text-charcoal-600", green: "bg-emerald-50 text-emerald-700 ring-emerald-100", gold: "bg-gold-50 text-gold-700 ring-gold-100", red: "bg-[#FBEAE7] text-[#9C3326] ring-[#F3CFC8]", blue: "bg-[#E8F1F8] text-[#2C5F85] ring-[#CFE1EE]", amber: "bg-[#FFF3DC] text-[#8A5A00] ring-[#F5DFAE]", dark: "bg-forest text-white" };
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ring-transparent", TONES[tone], className)}>{children}</span>;
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
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{label ?? status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</Badge>;
}

export function PageHeader({ title, sub, actions, icon }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode; icon?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon && <span className="grid h-11 w-11 place-items-center rounded-xl bg-forest text-gold-300"><Icon name={icon} className="h-5 w-5" /></span>}
        <div><h1 className="text-2xl font-semibold text-forest sm:text-3xl">{title}</h1>{sub && <p className="mt-0.5 text-sm text-charcoal-500">{sub}</p>}</div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, sub, icon, tone = "neutral", href, trend }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: string; tone?: "neutral" | "gold" | "red" | "green"; href?: string; trend?: React.ReactNode }) {
  const body = (
    <Card className={cn("h-full p-4 transition-shadow", href && "hover:shadow-md")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-charcoal-500">{label}</p>
        {icon && <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", tone === "gold" ? "bg-gold-50 text-gold-600" : tone === "red" ? "bg-[#FBEAE7] text-[#9C3326]" : "bg-forest-50 text-forest")}><Icon name={icon} className="h-4 w-4" /></span>}
      </div>
      <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-forest sm:text-[1.7rem]">{value}</p>
      {(sub || trend) && <p className="mt-1 text-xs text-charcoal-500">{sub} {trend}</p>}
    </Card>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function Field({ label, error, hint, children, className, required }: { label: string; error?: string; hint?: string; children: React.ReactNode; className?: string; required?: boolean }) {
  const id = useId();
  return (
    <div className={cn("space-y-1", className)}>
      <label htmlFor={id} className="block text-xs font-medium text-charcoal-600">{label}{required && <span className="text-[#A63D2F]"> *</span>}</label>
      {React.isValidElement(children) ? React.cloneElement(children as React.ReactElement<{ id?: string }>, { id }) : children}
      {hint && !error && <p className="text-xs text-charcoal-400">{hint}</p>}
      {error && <p role="alert" className="text-xs text-[#A63D2F]">{error}</p>}
    </div>
  );
}
const inputCls = "w-full rounded-lg border border-charcoal-200 bg-white px-3 py-2 text-sm text-charcoal placeholder:text-charcoal-300 focus:border-emerald focus:outline-none focus:ring-2 focus:ring-emerald/20 disabled:bg-charcoal-100";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) { return <input ref={ref} {...p} className={cn(inputCls, "h-10", className)} />; });
export function Select({ className, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select {...p} className={cn(inputCls, "h-10 pr-8", className)}>{children}</select>; }
export function Textarea({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...p} className={cn(inputCls, "min-h-[72px]", className)} />; }

export function Modal({ open, onClose, title, children, footer, size = "md" }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; size?: "sm" | "md" | "lg" | "xl" }) {
  useEffect(() => { if (!open) return; const h = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", h); document.body.style.overflow = "hidden"; return () => { window.removeEventListener("keydown", h); document.body.style.overflow = ""; }; }, [open, onClose]);
  if (!open) return null;
  const w = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest-950/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className={cn("pop flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl", w)}>
        <div className="flex items-center justify-between border-b border-charcoal-100 px-5 py-4"><h2 className="text-lg font-semibold text-forest">{title}</h2><button aria-label="Close" onClick={onClose} className="rounded-md p-1 text-charcoal-400 hover:bg-charcoal-100"><X className="h-5 w-5" /></button></div>
        <div className="scroll-thin overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-charcoal-100 bg-ivory-50 px-5 py-3 sm:rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: React.ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cn("scroll-thin mb-5 flex gap-1 overflow-x-auto border-b border-charcoal-100", className)}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} className={cn("-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors", value === t.id ? "border-gold text-forest" : "border-transparent text-charcoal-500 hover:text-forest")}>
          {t.label}{t.count !== undefined && <span className={cn("rounded-full px-1.5 text-xs", value === t.id ? "bg-gold-50 text-gold-700" : "bg-charcoal-100 text-charcoal-500")}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

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
        <thead><tr className="border-b border-charcoal-100 text-left text-xs uppercase tracking-wide text-charcoal-500">
          {columns.map((c) => <th key={c.key} className={cn("px-4 py-2.5 font-medium", c.align === "right" && "text-right", c.align === "center" && "text-center")}>
            {c.sortValue ? <button className="inline-flex items-center gap-1 hover:text-forest" onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: (s.dir * -1) as 1 | -1 } : { key: c.key, dir: 1 }))}>{c.header}{sort?.key === c.key && <span>{sort.dir === 1 ? "↑" : "↓"}</span>}</button> : c.header}
          </th>)}
        </tr></thead>
        <tbody>
          {data.slice(0, limit).map((r) => (
            <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn("border-b border-charcoal-100/70 last:border-0", onRowClick && "cursor-pointer hover:bg-ivory-50")}>
              {columns.map((c) => <td key={c.key} className={cn(dense ? "px-4 py-1.5" : "px-4 py-2.5", c.align === "right" && "text-right tabular-nums", c.align === "center" && "text-center", c.className)}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > limit && <div className="border-t border-charcoal-100 p-3 text-center"><Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + 50)}>Show more ({data.length - limit} remaining)</Button></div>}
    </div>
  );
}

export function Empty({ title, text, action, icon = "Inbox" }: { title: string; text?: string; action?: React.ReactNode; icon?: string }) {
  return <div className="flex flex-col items-center justify-center px-6 py-10 text-center"><span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-forest-50 text-forest/70"><Icon name={icon} className="h-6 w-6" /></span><p className="font-medium text-forest">{title}</p>{text && <p className="mt-1 max-w-sm text-sm text-charcoal-500">{text}</p>}{action && <div className="mt-4">{action}</div>}</div>;
}
export function Denied({ perm, what }: { perm?: string; what?: string }) {
  return <Card><Empty icon="Lock" title="Not available for your role" text={`${what ?? "This action"} requires permission${perm ? ` "${perm}"` : ""}. Use the Role switcher in the top bar to try another demo role.`} /></Card>;
}
export function Notice({ tone = "info", children, className }: { tone?: "info" | "warn" | "error" | "ok"; children: React.ReactNode; className?: string }) {
  const t = { info: "border-[#CFE1EE] bg-[#F1F7FB] text-[#2C5F85]", warn: "border-[#F5DFAE] bg-[#FFF8E8] text-[#6F4B00]", error: "border-[#F3CFC8] bg-[#FDF3F1] text-[#8C3025]", ok: "border-emerald-100 bg-emerald-50 text-emerald-700" }[tone];
  return <div className={cn("flex gap-2 rounded-lg border px-3 py-2 text-sm", t, className)}>{children}</div>;
}
export function Avatar({ name, seed = 0, size = 36 }: { name: string; seed?: number; size?: number }) {
  const hues = ["#0F3D2E", "#1F7A5A", "#7C6234", "#2C5F85", "#6B4F7A", "#8A5A00", "#4A504E"];
  return <span style={{ width: size, height: size, background: hues[seed % hues.length], fontSize: size * 0.38 }} className="inline-grid shrink-0 place-items-center rounded-full font-semibold text-white" aria-hidden>{initials(name)}</span>;
}
export function Progress({ value, tone = "green" }: { value: number; tone?: "green" | "gold" | "red" }) {
  const c = { green: "bg-emerald", gold: "bg-gold", red: "bg-[#A63D2F]" }[tone];
  return <div className="h-2 w-full overflow-hidden rounded-full bg-charcoal-100"><div className={cn("h-full rounded-full transition-all", c)} style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} /></div>;
}
export function ConfirmButton({ children, onConfirm, title, message, confirmLabel = "Confirm", variant = "danger", size = "sm", disabled, className }: { children: React.ReactNode; onConfirm: () => void; title: string; message: React.ReactNode; confirmLabel?: string; variant?: BtnVariant; size?: "sm" | "md"; disabled?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  return (<>
    <Button variant={variant} size={size} disabled={disabled} className={className} onClick={() => setOpen(true)}>{children}</Button>
    <Modal open={open} onClose={() => setOpen(false)} title={title} size="sm" footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button variant={variant} onClick={() => { setOpen(false); onConfirm(); }}>{confirmLabel}</Button></>}><div className="text-sm text-charcoal-600">{message}</div></Modal>
  </>);
}
export function KV({ k, v }: { k: string; v: React.ReactNode }) { return <div className="flex justify-between gap-4 py-1.5 text-sm"><span className="text-charcoal-500">{k}</span><span className="text-right font-medium text-charcoal">{v}</span></div>; }
export function DemoBadge({ className }: { className?: string }) { return <span className={cn("inline-flex items-center gap-1 rounded-full bg-gold px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white", className)}><Icons.FlaskConical className="h-3 w-3" />Demo data</span>; }

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
