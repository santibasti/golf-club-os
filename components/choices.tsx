"use client";
import React, { useRef } from "react";
import { Star } from "lucide-react";
import { Icon, cn } from "./ui";

export interface Choice<T extends string | number> { value: T; label: string; icon?: string; hint?: string; disabled?: boolean; tone?: "default" | "red" | "amber" | "green" | "gold" }

/** Icon-based single choice (replaces a <select> for short lists). Accessible radiogroup with arrow-key navigation.
 *  variant "tile": icon above label (payment, channel…) · "segment": compact inline pills (holes, periods, filters). */
export function ChoiceGroup<T extends string | number>({ value, onChange, options, variant = "tile", columns, className, id, label, wrap = false }: { value: T; onChange: (v: T) => void; options: Choice<T>[]; variant?: "tile" | "segment"; columns?: number; className?: string; id?: string; label?: string; wrap?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (dir: 1 | -1) => { const en = options.filter((o) => !o.disabled); const i = en.findIndex((o) => o.value === value); const n = en[(i + dir + en.length) % en.length]; if (n) { onChange(n.value); setTimeout(() => ref.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus(), 0); } };
  const toneSel: Record<string, string> = { default: "border-emerald bg-forest-50 text-forest ring-2 ring-emerald/20", green: "border-emerald bg-emerald-50 text-emerald-700 ring-2 ring-emerald/20", red: "border-[#B4473A] bg-[#FBEAE7] text-[#9C3326] ring-2 ring-[#B4473A]/20", amber: "border-[#D98E04] bg-[#FFF3DC] text-[#8A5A00] ring-2 ring-[#D98E04]/20", gold: "border-gold bg-gold-50 text-gold-700 ring-2 ring-gold/25" };
  const cols = columns ?? Math.min(options.length, variant === "tile" ? 5 : options.length);
  return (
    <div ref={ref} id={id} role="radiogroup" aria-label={label} onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(1); } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(-1); } }}
      className={cn(variant === "tile" ? "grid gap-2" : cn("inline-flex max-w-full gap-1 rounded-xl border border-line bg-charcoal-100/50 p-1", wrap ? "flex-wrap" : "scroll-thin overflow-x-auto whitespace-nowrap"), className)} style={variant === "tile" ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined}>
      {options.map((o) => { const on = o.value === value; return (
        <button key={String(o.value)} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} disabled={o.disabled} title={o.hint} onClick={() => onChange(o.value)}
          className={cn("transition-all disabled:cursor-not-allowed disabled:opacity-40",
            variant === "tile" ? cn("flex flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-center text-[12px] font-medium leading-tight", on ? toneSel[o.tone ?? "default"] : "border-charcoal-200 bg-white text-charcoal-600 hover:border-charcoal-300 hover:bg-ivory-50")
              : cn("inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium", on ? "bg-white text-forest shadow-[0_1px_3px_rgba(15,61,46,.12)] ring-1 ring-line" : "text-charcoal-500 hover:text-forest"))}>
          {o.icon && <Icon name={o.icon} className={variant === "tile" ? "h-5 w-5" : "h-4 w-4"} />}<span>{o.label}</span>
        </button>); })}
    </div>
  );
}

export type PayMethodValue = "cash" | "gcash" | "card" | "bank_transfer" | "member_account";
const PAY: Choice<PayMethodValue>[] = [
  { value: "cash", label: "Cash", icon: "Banknote" }, { value: "gcash", label: "GCash", icon: "Smartphone", hint: "Simulated — no real payment" }, { value: "card", label: "Card", icon: "CreditCard", hint: "Simulated — no real payment" },
  { value: "bank_transfer", label: "Bank", icon: "Landmark" }, { value: "member_account", label: "Member account", icon: "BookUser", hint: "Charge to the member's account" },
];
/** Payment method picker. `memberAccount` shows the "charge to member account" tile only when a member is on the bill. */
export function PaymentChoice({ value, onChange, memberAccount = false, id }: { value: PayMethodValue; onChange: (v: PayMethodValue) => void; memberAccount?: boolean; id?: string }) {
  const opts = PAY.filter((o) => o.value !== "member_account" || memberAccount);
  return <ChoiceGroup id={id} label="Payment method" value={value} onChange={onChange} options={opts} columns={opts.length} />;
}
export function HolesChoice({ value, onChange }: { value: 9 | 18; onChange: (v: 9 | 18) => void }) {
  return <ChoiceGroup variant="segment" label="Holes" value={value} onChange={onChange} options={[{ value: 18, label: "18 holes", icon: "Flag" }, { value: 9, label: "9 holes", icon: "FlagTriangleRight" }]} />;
}
export function StarRating({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return <div role="radiogroup" aria-label="Rating" className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => onChange(n)} className="rounded p-1 transition-transform hover:scale-110"><Star className={cn("h-8 w-8", n <= value ? "fill-gold text-gold" : "text-charcoal-300")} /></button>)}</div>;
}
/** Visual bay grid (replaces a 20-item dropdown). `occupied` maps bay → occupant name. */
export function BayPicker({ value, onChange, bays, occupied, allowNone = false }: { value: number; onChange: (b: number) => void; bays: number; occupied: Record<number, string>; allowNone?: boolean }) {
  return (
    <div>
      <div role="radiogroup" aria-label="Bay" className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
        {Array.from({ length: bays }, (_, i) => i + 1).map((b) => { const occ = occupied[b]; const on = value === b; return (
          <button key={b} type="button" role="radio" aria-checked={on} disabled={!!occ} title={occ ? `Occupied — ${occ}` : `Bay ${b}`} onClick={() => onChange(on && allowNone ? 0 : b)}
            className={cn("h-10 rounded-lg border text-sm font-semibold transition-all", occ ? "cursor-not-allowed border-charcoal-100 bg-charcoal-100/70 text-charcoal-300 line-through" : on ? "border-forest bg-forest text-white shadow-sm" : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald hover:bg-emerald-100")}>{b}</button>); })}
      </div>
      <p className="mt-1.5 text-xs text-charcoal-500">{value ? `Bay ${value} selected` : allowNone ? "No bay yet — tap a free bay to assign one" : "Tap a free bay"} · <span className="text-charcoal-400">greyed = occupied</span></p>
    </div>
  );
}
/** Visual cart chooser (replaces a dropdown of cart numbers). */
export function CartPicker({ value, onChange, carts }: { value: string; onChange: (id: string) => void; carts: { id: string; no: number; type: string; battery: number | null; condition: string }[] }) {
  return (
    <div role="radiogroup" aria-label="Cart" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {carts.map((c) => { const on = value === c.id; return (
        <button key={c.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(c.id)} className={cn("rounded-xl border p-2.5 text-center transition-all", on ? "border-forest bg-forest text-white shadow-sm" : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald")}>
          <Icon name="Car" className="mx-auto h-5 w-5" /><div className="font-display text-lg font-semibold leading-tight">#{c.no}</div><div className={cn("text-[10px]", on ? "text-white/80" : "text-charcoal-500")}>{c.type.replace("-seater", "-seat")} · {c.battery === null ? "gas" : `${c.battery}%`}</div></button>); })}
    </div>
  );
}
/** Quick discount chips with a custom field fallback. */
export function DiscountChips({ value, onChange, presets = [0, 5, 10, 15, 20], max }: { value: number; onChange: (n: number) => void; presets?: number[]; max?: number }) {
  return <ChoiceGroup variant="segment" label="Discount" value={presets.includes(value) ? value : -1} onChange={(v) => onChange(v)} options={presets.map((p) => ({ value: p, label: p === 0 ? "None" : `${p}%`, disabled: max !== undefined && false }))} />;
}
