"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { Icon, cn } from "./ui";
import { tilesFor } from "@/lib/simple";

/** Big, obvious buttons for the role's main jobs, each with a live count. */
export function HomeTiles() {
  const { db, session } = useStore(); const tiles = useMemo(() => tilesFor(db, session.role), [db, session.role]); if (!tiles.length) return null;
  return (
    <section aria-label="Your main jobs" className={cn("mb-6 grid gap-3", tiles.length >= 4 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 lg:grid-cols-3")}>
      {tiles.map((t) => (
        <Link key={t.label} href={t.href} className={cn("group relative flex min-h-[7.5rem] flex-col justify-between rounded-2xl border p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift active:scale-[.98]", t.tone === "gold" ? "border-gold-300 bg-gradient-to-br from-gold-50 to-white" : t.tone === "alert" ? "border-[#E7B7AE] bg-[#FDF3F1]" : "border-line bg-white")}>
          <span className="flex items-start justify-between"><span className={cn("grid h-11 w-11 place-items-center rounded-xl", t.tone === "gold" ? "bg-gold text-white" : t.tone === "alert" ? "bg-[#B4473A] text-white" : "bg-forest text-gold-300")}><Icon name={t.icon} className="h-5 w-5" /></span>{t.badge !== undefined && t.badge > 0 && <span className={cn("grid min-w-7 place-items-center rounded-full px-2 py-0.5 text-sm font-bold tabular-nums text-white", t.tone === "alert" ? "bg-[#B4473A]" : "bg-forest")}>{t.badge >= 1000 ? `₱${(t.badge / 1000).toFixed(1)}k` : t.badge}</span>}</span>
          <span><span className="block text-[17px] font-semibold leading-tight text-forest">{t.label}</span><span className="mt-0.5 block text-[13px] leading-snug text-charcoal-500">{t.sub}</span></span>
        </Link>))}
    </section>
  );
}
