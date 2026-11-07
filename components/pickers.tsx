"use client";
import React, { useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { Input, Badge, cn } from "./ui";

export interface Person { name: string; phone?: string; customerId?: string; memberId?: string }
/** Typeahead for customers / members. kind="member" restricts to member records; "any" allows free-typed names (walk-ins). */
export function PersonPicker({ value, onChange, kind = "any", placeholder, memberOnlyActive }: { value: Person | null; onChange: (p: Person | null, typed?: string) => void; kind?: "member" | "any" | "public"; placeholder?: string; memberOnlyActive?: boolean }) {
  const { db } = useStore(); const [q, setQ] = useState(value?.name ?? ""); const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  const res = useMemo(() => {
    const s = q.trim().toLowerCase(); if (s.length < 2) return [];
    return db.customers.filter((c) => { const m = c.memberId ? db.members.find((x) => x.id === c.memberId) : undefined; if (kind === "member" && !m) return false; if (kind === "public" && m && m.status === "active") return false; return c.name.toLowerCase().includes(s) || (m && m.id.toLowerCase().includes(s)) || c.phone.includes(s); }).slice(0, 7).map((c) => ({ c, m: c.memberId ? db.members.find((x) => x.id === c.memberId) : undefined }));
  }, [q, db, kind]);
  return (
    <div ref={ref} className="relative">
      <Input value={q} placeholder={placeholder ?? (kind === "member" ? "Search member name / ID…" : "Search or type a name…")} onChange={(e) => { setQ(e.target.value); setOpen(true); onChange(kind === "member" ? null : { name: e.target.value }, e.target.value); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && res.length > 0 && (
        <div className="absolute left-0 right-0 top-11 z-30 overflow-hidden rounded-lg border border-charcoal-100 bg-white shadow-xl">
          {res.map(({ c, m }) => { const dis = !!memberOnlyActive && m?.status !== "active"; return (
            <button type="button" key={c.id} onMouseDown={(e) => e.preventDefault()} onClick={() => { if (dis) return; setQ(c.name); setOpen(false); onChange({ name: c.name, phone: c.phone, customerId: c.id, memberId: m?.id }); }} className={cn("flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-ivory-50", dis && "opacity-50")}>
              <span><span className="font-medium">{c.name}</span><span className="ml-2 text-xs text-charcoal-400">{m ? m.id : c.id} · {c.phone}</span></span>{m ? <Badge tone={m.status === "active" ? "green" : "red"}>{m.status.replace("_", " ")}</Badge> : <Badge>public</Badge>}
            </button>); })}
        </div>)}
    </div>
  );
}
