"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { FlaskConical, Navigation, Search } from "lucide-react";
import { useStore } from "@/lib/store";
import { Badge, Card, CardHeader, Input, Notice, Progress, StatusBadge, cn } from "./ui";
import { BARN, CLUBHOUSE, HOLES_GEO, MAP_H, MAP_W, RANGE, SHED, allTracks, type CartTrack } from "@/lib/services/tracking";
import { holePlayability } from "@/lib/services/maintenance";
import { cartsFor } from "@/lib/services/cart";
import { fmt12, fmtTs } from "@/lib/time";

const COLOR: Record<string, string> = { available: "#1F7A5A", reserved: "#2C5F85", dispatched: "#B8975A", in_use: "#0F3D2E", returned: "#C98A00", inspection: "#C98A00", maintenance: "#B4473A" };
const path = (n: number) => { const h = HOLES_GEO[n - 1]; return `M${h.tee.x},${h.tee.y} Q${h.bend.x * 2 - (h.tee.x + h.green.x) / 2},${h.bend.y * 2 - (h.tee.y + h.green.y) / 2} ${h.green.x},${h.green.y}`; };
function rng(seed: number) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function Scenery() {
  const trees = useMemo(() => {
    const r = rng(7); const samples: { x: number; y: number }[] = []; for (const h of HOLES_GEO) for (let t = 0; t <= 1; t += 0.1) samples.push({ x: (1 - t) * (1 - t) * h.tee.x + 2 * (1 - t) * t * (h.bend.x * 2 - (h.tee.x + h.green.x) / 2) + t * t * h.green.x, y: (1 - t) * (1 - t) * h.tee.y + 2 * (1 - t) * t * (h.bend.y * 2 - (h.tee.y + h.green.y) / 2) + t * t * h.green.y });
    const out: { x: number; y: number; r: number }[] = []; let guard = 0;
    while (out.length < 170 && guard++ < 4000) { const x = 20 + r() * (MAP_W - 40), y = 20 + r() * (MAP_H - 70); if (samples.some((s) => Math.hypot(s.x - x, s.y - y) < 40) || (y > 600 && x > 40 && x < 780) || Math.hypot(x - 410, y - 330) < 38) continue; out.push({ x, y, r: 5 + r() * 5 }); }
    return out;
  }, []);
  return <g>{trees.map((t, i) => <g key={i}><circle cx={t.x + 1.5} cy={t.y + 2} r={t.r} fill="#0A2C21" opacity=".18" /><circle cx={t.x} cy={t.y} r={t.r} fill={i % 3 ? "#2C6B4E" : "#1F5C42"} opacity=".9" /></g>)}</g>;
}

export function CourseMap({ compact = false }: { compact?: boolean }) {
  const { db } = useStore(); const tracks = useMemo(() => allTracks(db), [db]); const [sel, setSel] = useState<number | null>(null); const [q, setQ] = useState(""); const [barn, setBarn] = useState(true);
  const out = tracks.filter((t) => t.zone === "course" || t.zone === "clubhouse"); const t = sel ? tracks.find((x) => x.no === sel) ?? null : null; const book = t?.bookingId ? db.bookings.find((b) => b.id === t.bookingId) : undefined; const cart = t ? db.carts.find((c) => c.id === t.cartId) : undefined;
  const match = (x: CartTrack) => !q.trim() || String(x.no) === q.replace("#", "").trim();
  const closures = db.closures.filter((c) => c.active && c.date === db.meta.now.slice(0, 10)); const nowT = db.meta.now.slice(11, 16);
  const hazardHoles = new Map<number, "restricted" | "closed">(); db.holes.forEach((h) => { const p = holePlayability(db, h.no); if (p.label !== "Playable") hazardHoles.set(h.no, p.label === "Closed" ? "closed" : "restricted"); });
  const counts = { out: out.length, barn: tracks.filter((x) => x.zone === "barn").length, shed: tracks.filter((x) => x.zone === "shed").length, tee: tracks.filter((x) => x.zone === "tee").length };
  return (
    <div className="space-y-4">
      <Notice tone="warn" className="items-center"><FlaskConical className="h-4 w-4 shrink-0" /><span><b>Simulated positions.</b> No GPS hardware is connected in this demo — cart locations are calculated from each flight&apos;s progress and move as you advance the demo clock. With real trackers, only the data source changes (see docs/GPS_INTEGRATION.md).</span></Notice>
      <div className={cn("grid gap-4", compact ? "xl:grid-cols-3" : "xl:grid-cols-4")}>
        <Card className={cn("overflow-hidden", compact ? "xl:col-span-2" : "xl:col-span-3")}>
          <CardHeader title="Live course map" sub={`${counts.out} on course · ${counts.tee} at tee · ${counts.barn} at barn · ${counts.shed} in maintenance`} action={<div className="flex flex-wrap items-center gap-2"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-charcoal-400" /><Input className="h-9 w-32 pl-8" placeholder="Cart #" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find cart number" /></div><label className="flex items-center gap-1.5 text-xs text-charcoal-600"><input type="checkbox" checked={barn} onChange={(e) => setBarn(e.target.checked)} />Parked carts</label></div>} />
          <div className="relative bg-[#CFE3C9]">
            <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="block h-auto w-full" role="img" aria-label="Golf course map with live cart positions">
              <defs><linearGradient id="grass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#BFD9B6" /><stop offset="1" stopColor="#A9CBA0" /></linearGradient><pattern id="hatchR" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="8" fill="#D98E04" opacity=".55" /></pattern><pattern id="hatchC" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="8" fill="#B4473A" opacity=".6" /></pattern></defs>
              <rect width={MAP_W} height={MAP_H} fill="url(#grass)" />
              <ellipse cx="410" cy="330" rx="34" ry="22" fill="#8EC1DA" stroke="#6AA6C4" strokeWidth="3" /><ellipse cx="880" cy="250" rx="42" ry="26" fill="#8EC1DA" stroke="#6AA6C4" strokeWidth="3" /><ellipse cx="120" cy="250" rx="30" ry="40" fill="#8EC1DA" stroke="#6AA6C4" strokeWidth="3" />
              <Scenery />
              {HOLES_GEO.map((h) => <path key={"f" + h.no} d={path(h.no)} fill="none" stroke="#8FBF7F" strokeWidth="34" strokeLinecap="round" opacity=".95" />)}
              {HOLES_GEO.map((h) => <path key={"c" + h.no} d={path(h.no)} fill="none" stroke="#7DAF6D" strokeWidth="10" strokeLinecap="round" strokeDasharray="1 14" opacity=".6" />)}
              {HOLES_GEO.map((h) => { const hz = hazardHoles.get(h.no); return hz ? <path key={"z" + h.no} d={path(h.no)} fill="none" stroke={`url(#${hz === "closed" ? "hatchC" : "hatchR"})`} strokeWidth="38" strokeLinecap="round" /> : null; })}
              {HOLES_GEO.map((h) => <g key={"g" + h.no}><circle cx={h.green.x} cy={h.green.y} r="13" fill="#5E9F57" stroke="#4A8545" strokeWidth="2" /><circle cx={h.green.x} cy={h.green.y} r="2.2" fill="#fff" /><rect x={h.tee.x - 6} y={h.tee.y - 4} width="12" height="8" rx="2" fill="#6FA862" stroke="#fff" strokeWidth="1" /></g>)}
              {[[360, 515], [182, 468], [255, 190], [445, 108], [455, 218], [662, 548], [815, 462], [770, 214], [588, 245], [706, 452]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="9" ry="6" fill="#EDE2BE" stroke="#D8C995" strokeWidth="1.5" />)}
              {HOLES_GEO.map((h) => { const hz = hazardHoles.get(h.no); return <g key={"n" + h.no}><circle cx={h.tee.x - 16} cy={h.tee.y - 12} r="10" fill={hz === "closed" ? "#B4473A" : hz ? "#D98E04" : "#0F3D2E"} stroke="#fff" strokeWidth="2" /><text x={h.tee.x - 16} y={h.tee.y - 8.2} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#fff">{h.no}</text></g>; })}
              {/* buildings */}
              <g><rect x={CLUBHOUSE.x - 46} y={CLUBHOUSE.y - 18} width="92" height="36" rx="8" fill="#F6F0E0" stroke="#B8975A" strokeWidth="2" /><text x={CLUBHOUSE.x} y={CLUBHOUSE.y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0F3D2E">CLUBHOUSE</text></g>
              <g><rect x={BARN.x - 70} y={BARN.y - 17} width="146" height="48" rx="6" fill="#E9EEE6" stroke="#8A908E" strokeWidth="1.5" /><text x={BARN.x + 3} y={BARN.y + 44} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#454B49">CART BARN</text></g>
              <g><rect x={SHED.x - 30} y={SHED.y - 14} width="62" height="36" rx="6" fill="#F3E6E2" stroke="#B4473A" strokeWidth="1.5" /><text x={SHED.x + 1} y={SHED.y + 36} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#9C3326">MAINTENANCE</text></g>
              <g><rect x={RANGE.x - 150} y={RANGE.y - 40} width="190" height="70" rx="8" fill="#B7D6AE" stroke="#8FBF7F" strokeWidth="2" strokeDasharray="5 4" />{Array.from({ length: 10 }, (_, i) => <rect key={i} x={RANGE.x - 142 + i * 18} y={RANGE.y + 14} width="12" height="10" rx="2" fill="#0F3D2E" opacity=".8" />)}<text x={RANGE.x - 55} y={RANGE.y - 14} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0F3D2E">DRIVING RANGE</text></g>
              {/* carts */}
              {tracks.filter((x) => (barn || (x.zone !== "barn")) && match(x)).sort((a, b) => (a.zone === "course" ? 1 : 0) - (b.zone === "course" ? 1 : 0)).map((x) => { const c = db.carts.find((k) => k.id === x.cartId)!; const active = x.zone === "course" || x.zone === "clubhouse"; const isSel = sel === x.no; const col = x.hazard ? "#B4473A" : COLOR[c.status];
                return <g key={x.cartId} transform={`translate(${x.x},${x.y})`} className="cursor-pointer" onClick={() => setSel(isSel ? null : x.no)} role="button" aria-label={`Cart ${x.no}, ${c.status}`}>
                  {active && <circle r="16" fill={col} opacity=".22"><animate attributeName="r" values="10;20;10" dur="2.4s" repeatCount="indefinite" /><animate attributeName="opacity" values=".3;0;.3" dur="2.4s" repeatCount="indefinite" /></circle>}
                  {isSel && <circle r="17" fill="none" stroke="#B8975A" strokeWidth="3" />}
                  <rect x={active ? -11 : -6} y={active ? -9 : -5} width={active ? 22 : 12} height={active ? 18 : 10} rx={active ? 6 : 3} fill={col} stroke="#fff" strokeWidth={active ? 2 : 1.2} />
                  {active ? <text y="4" textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff">{x.no}</text> : null}
                  {x.hazard && <text x="12" y="-10" fontSize="14">⚠</text>}
                </g>; })}
            </svg>
            <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 rounded-xl bg-white/90 px-3 py-2 text-[11px] shadow-card backdrop-blur">{Object.entries(COLOR).filter(([k]) => k !== "inspection" && k !== "returned").map(([k, c]) => <span key={k} className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{k.replace("_", " ")}</span>)}<span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#D98E04]/70" />restricted hole</span></div>
            <div className="pointer-events-none absolute right-3 top-3 rounded-xl bg-white/90 px-3 py-1.5 text-[11px] text-charcoal-600 shadow-card">Updated {fmt12(nowT)} · <span className="font-semibold text-[#8A5A00]">simulated</span></div>
          </div>
        </Card>

        <div className="space-y-4">
          {t && cart ? (
            <Card className="border-gold-300"><CardHeader title={<span className="flex items-center gap-2">Cart #{t.no}<StatusBadge status={cart.status} /></span>} sub={`${cart.type} · ${cart.fuel === "electric" ? "electric" : "gas"}`} action={<button className="text-xs text-charcoal-400 hover:text-charcoal" onClick={() => setSel(null)}>Close</button>} />
              <div className="space-y-2 p-4 text-sm">
                {book ? <><p className="font-medium text-forest">{book.contactName} <span className="text-xs font-normal text-charcoal-500">{book.ref}</span></p><p className="text-xs text-charcoal-500">Tee {fmt12(book.time)} · {book.players.map((p) => p.name.split(" ")[0]).join(", ")} · {cartsFor(db, book.id).length} cart(s)</p></> : <p className="text-charcoal-500">Not assigned to a flight.</p>}
                {t.zone === "course" && <><div className="flex items-center justify-between"><span className="text-charcoal-500">Position</span><b>Hole {t.hole} of {book?.holes ?? 18}</b></div><Progress value={t.progress ?? 0} tone={t.paceStatus === "behind" ? "red" : "green"} />
                  <div className="flex items-center justify-between"><span className="text-charcoal-500">Pace</span>{t.paceStatus === "behind" ? <Badge tone="red">{t.behindMin} min behind</Badge> : <Badge tone="green">on pace</Badge>}</div>
                  <div className="flex justify-between"><span className="text-charcoal-500">Time on course</span><b>{Math.floor((t.elapsedMin ?? 0) / 60)}h {(t.elapsedMin ?? 0) % 60}m</b></div></>}
                {t.hazard && <Notice tone="error" className="py-1.5 text-xs">On a {t.hazard.kind} hole: {t.hazard.reason}</Notice>}
                <div className="grid grid-cols-2 gap-2 border-t border-line pt-2 text-xs"><div><p className="text-charcoal-400">Speed</p><b>{t.speedKmh} km/h</b></div><div><p className="text-charcoal-400">Battery</p><b className={t.battery !== null && t.battery < 20 ? "text-[#9C3326]" : ""}>{t.battery === null ? "gas" : `${t.battery}%`}</b></div><div><p className="text-charcoal-400">GPS accuracy</p><b>±{t.accuracyM} m</b></div><div><p className="text-charcoal-400">Last ping</p><b>{t.lastPingSec}s ago</b></div></div>
                <p className="text-[11px] text-charcoal-400">Dispatched {fmtTs(cart.dispatchedAt)} · values simulated</p>
                <div className="flex flex-wrap gap-3 pt-1 text-xs"><Link className="font-medium text-emerald underline" href="/carts">Cart dispatch →</Link>{book && <Link className="font-medium text-emerald underline" href="/check-in?tab=starter">Flight →</Link>}</div>
              </div></Card>
          ) : null}
          <Card><CardHeader title="Carts on the course" sub={`${out.length} out now`} />
            {out.length === 0 ? <p className="p-5 text-sm text-charcoal-500">No carts on the course at this time.</p> : <ul className="scroll-thin max-h-[420px] divide-y divide-line/60 overflow-y-auto">{[...out].sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0)).map((x) => (
              <li key={x.cartId}><button onClick={() => setSel(x.no)} className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-ivory-50", sel === x.no && "bg-gold-50")}>
                <span className={cn("grid h-8 w-10 shrink-0 place-items-center rounded-lg text-xs font-bold text-white", x.hazard ? "bg-[#B4473A]" : "bg-forest")}>{x.no}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{x.flightLabel}</span><span className="flex items-center gap-2 text-xs text-charcoal-500"><Navigation className="h-3 w-3" />Hole {x.hole}{x.paceStatus === "behind" && <Badge tone="red" className="py-0">+{x.behindMin}m</Badge>}{x.hazard && <Badge tone="red" className="py-0">restricted</Badge>}{x.overdue && <Badge tone="amber" className="py-0">overdue</Badge>}</span></span>
                <span className="w-12 text-right text-xs tabular-nums text-charcoal-500">{Math.round((x.progress ?? 0) * 100)}%</span></button></li>))}</ul>}</Card>
          {closures.length > 0 && <Card><CardHeader title="Active restrictions today" /><ul className="divide-y divide-line/60 text-sm">{closures.map((c) => <li key={c.id} className="px-4 py-2.5"><Badge tone={c.type === "partial" ? "amber" : "red"}>{c.type === "partial" ? `holes ${c.holes.join(", ")}` : c.type}</Badge> <span className="text-xs text-charcoal-500">{fmt12(c.from)}–{fmt12(c.to)}</span><p className="mt-0.5 text-xs">{c.reason}</p></li>)}</ul></Card>}
        </div>
      </div>
    </div>
  );
}
