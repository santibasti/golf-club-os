"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FastForward, FlaskConical, Navigation, Pause, Play, RefreshCw, Search, Tag, Users } from "lucide-react";
import { useStore } from "@/lib/store";
import { Avatar, Badge, Button, Card, CardHeader, Input, Notice, Progress, StatusBadge, cn } from "./ui";
import { BARN, CLUBHOUSE, HOLES_GEO, MAP_H, MAP_W, RANGE, SHED, allTracks, pathAt, type CartTrack } from "@/lib/services/tracking";
import { holePlayability } from "@/lib/services/maintenance";
import { cartsFor } from "@/lib/services/cart";
import { addMinTs, fmt12, fmtTs } from "@/lib/time";

const COLOR: Record<string, string> = { available: "#1F7A5A", reserved: "#2C5F85", dispatched: "#B8975A", in_use: "#0F3D2E", returned: "#C98A00", inspection: "#C98A00", maintenance: "#B4473A" };
const TYPE_COLOR = { member: "#0F3D2E", guest: "#B8975A", public: "#FFFFFF" } as const;
const first = (n: string) => n.split(" ")[0];
const ctrl = (n: number) => `${n}`; void ctrl;
const curve = (n: number) => { const h = HOLES_GEO[n - 1]; return { cx: h.bend.x * 2 - (h.tee.x + h.green.x) / 2, cy: h.bend.y * 2 - (h.tee.y + h.green.y) / 2 }; };
const path = (n: number) => { const h = HOLES_GEO[n - 1]; const c = curve(n); return `M${h.tee.x},${h.tee.y} Q${c.cx},${c.cy} ${h.green.x},${h.green.y}`; };
function rng(seed: number) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Everything that never moves — memoised so animation frames only re-render the carts. */
const StaticLayer = memo(function StaticLayer({ hazKey }: { hazKey: string }) {
  const haz = useMemo(() => new Map<number, string>(hazKey ? hazKey.split(",").map((s) => { const [n, k] = s.split(":"); return [Number(n), k] as [number, string]; }) : []), [hazKey]);
  const trees = useMemo(() => {
    const r = rng(7); const samples: { x: number; y: number }[] = [];
    for (const h of HOLES_GEO) for (let t = 0; t <= 1; t += 0.1) { const c = { x: h.bend.x * 2 - (h.tee.x + h.green.x) / 2, y: h.bend.y * 2 - (h.tee.y + h.green.y) / 2 }; samples.push({ x: (1 - t) * (1 - t) * h.tee.x + 2 * (1 - t) * t * c.x + t * t * h.green.x, y: (1 - t) * (1 - t) * h.tee.y + 2 * (1 - t) * t * c.y + t * t * h.green.y }); }
    const out: { x: number; y: number; r: number }[] = []; let guard = 0;
    while (out.length < 170 && guard++ < 4000) { const x = 20 + r() * (MAP_W - 40), y = 20 + r() * (MAP_H - 70); if (samples.some((s) => Math.hypot(s.x - x, s.y - y) < 40) || (y > 600 && x > 40 && x < 780) || Math.hypot(x - 410, y - 330) < 38) continue; out.push({ x, y, r: 5 + r() * 5 }); }
    return out;
  }, []);
  return (
    <g>
      <defs><linearGradient id="grass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#BFD9B6" /><stop offset="1" stopColor="#A9CBA0" /></linearGradient>
        <pattern id="hatchR" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="8" fill="#D98E04" opacity=".55" /></pattern><pattern id="hatchC" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="8" fill="#B4473A" opacity=".6" /></pattern></defs>
      <rect width={MAP_W} height={MAP_H} fill="url(#grass)" />
      <ellipse cx="410" cy="330" rx="34" ry="22" fill="#8EC1DA" stroke="#6AA6C4" strokeWidth="3" /><ellipse cx="880" cy="250" rx="42" ry="26" fill="#8EC1DA" stroke="#6AA6C4" strokeWidth="3" /><ellipse cx="120" cy="250" rx="30" ry="40" fill="#8EC1DA" stroke="#6AA6C4" strokeWidth="3" />
      {trees.map((t, i) => <g key={i}><circle cx={t.x + 1.5} cy={t.y + 2} r={t.r} fill="#0A2C21" opacity=".18" /><circle cx={t.x} cy={t.y} r={t.r} fill={i % 3 ? "#2C6B4E" : "#1F5C42"} opacity=".9" /></g>)}
      {HOLES_GEO.map((h) => <path key={"f" + h.no} d={path(h.no)} fill="none" stroke="#8FBF7F" strokeWidth="34" strokeLinecap="round" opacity=".95" />)}
      {HOLES_GEO.map((h) => <path key={"c" + h.no} d={path(h.no)} fill="none" stroke="#7DAF6D" strokeWidth="10" strokeLinecap="round" strokeDasharray="1 14" opacity=".6" />)}
      {HOLES_GEO.map((h) => { const hz = haz.get(h.no); return hz ? <path key={"z" + h.no} d={path(h.no)} fill="none" stroke={`url(#${hz === "closed" ? "hatchC" : "hatchR"})`} strokeWidth="38" strokeLinecap="round" /> : null; })}
      {HOLES_GEO.map((h) => <g key={"g" + h.no}><circle cx={h.green.x} cy={h.green.y} r="13" fill="#5E9F57" stroke="#4A8545" strokeWidth="2" /><circle cx={h.green.x} cy={h.green.y} r="2.2" fill="#fff" /><rect x={h.tee.x - 6} y={h.tee.y - 4} width="12" height="8" rx="2" fill="#6FA862" stroke="#fff" strokeWidth="1" /></g>)}
      {[[360, 515], [182, 468], [255, 190], [445, 108], [455, 218], [662, 548], [815, 462], [770, 214], [588, 245], [706, 452]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="9" ry="6" fill="#EDE2BE" stroke="#D8C995" strokeWidth="1.5" />)}
      {HOLES_GEO.map((h) => { const hz = haz.get(h.no); return <g key={"n" + h.no}><circle cx={h.tee.x - 16} cy={h.tee.y - 12} r="10" fill={hz === "closed" ? "#B4473A" : hz ? "#D98E04" : "#0F3D2E"} stroke="#fff" strokeWidth="2" /><text x={h.tee.x - 16} y={h.tee.y - 8.2} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#fff">{h.no}</text></g>; })}
      <g><rect x={CLUBHOUSE.x - 46} y={CLUBHOUSE.y - 18} width="92" height="36" rx="8" fill="#F6F0E0" stroke="#B8975A" strokeWidth="2" /><text x={CLUBHOUSE.x} y={CLUBHOUSE.y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0F3D2E">CLUBHOUSE</text></g>
      <g><rect x={BARN.x - 70} y={BARN.y - 17} width="146" height="48" rx="6" fill="#E9EEE6" stroke="#8A908E" strokeWidth="1.5" /><text x={BARN.x + 3} y={BARN.y + 44} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#454B49">CART BARN</text></g>
      <g><rect x={SHED.x - 30} y={SHED.y - 14} width="62" height="36" rx="6" fill="#F3E6E2" stroke="#B4473A" strokeWidth="1.5" /><text x={SHED.x + 1} y={SHED.y + 36} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#9C3326">MAINTENANCE</text></g>
      <g><rect x={RANGE.x - 150} y={RANGE.y - 40} width="190" height="70" rx="8" fill="#B7D6AE" stroke="#8FBF7F" strokeWidth="2" strokeDasharray="5 4" />{Array.from({ length: 10 }, (_, i) => <rect key={i} x={RANGE.x - 142 + i * 18} y={RANGE.y + 14} width="12" height="10" rx="2" fill="#0F3D2E" opacity=".8" />)}<text x={RANGE.x - 55} y={RANGE.y - 14} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0F3D2E">DRIVING RANGE</text></g>
    </g>
  );
});

function trailOf(t: CartTrack): string | null {
  if (t.zone !== "course" || t.holeProgress === undefined || !t.holes) return null; const p = t.holeProgress; if (p < 0.05) return null;
  const pts: string[] = []; const from = Math.max(0, p - 0.7); for (let i = 0; i <= 14; i++) { const q = pathAt(from + ((p - from) * i) / 14, t.holes).pt; pts.push(`${q.x.toFixed(1)},${q.y.toFixed(1)}`); }
  return pts.join(" ");
}

function CrewChips({ t, size = 26 }: { t: CartTrack; size?: number }) {
  return (<div className="space-y-1.5">
    {(t.riders ?? []).map((r) => <div key={r.name} className="flex items-center gap-2"><Avatar name={r.name} seed={r.name.length} size={size} /><span className="min-w-0 flex-1 truncate text-sm font-medium">{r.name}</span><Badge tone={r.type === "member" ? "green" : r.type === "guest" ? "gold" : "neutral"} className="py-0">{r.type}{r.memberId ? ` ${r.memberId}` : ""}</Badge></div>)}
    {(t.caddies ?? []).map((c) => <div key={c.id} className="flex items-center gap-2"><span className="relative"><Avatar name={c.name} seed={c.name.length + 3} size={size} /><span className="absolute -bottom-1 -right-1 rounded-full bg-gold px-1 text-[8px] font-bold leading-4 text-white ring-1 ring-white">C</span></span><span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span><Badge tone="amber" className="py-0">caddie · cat {c.category}</Badge></div>)}
    {!t.riders?.length && !t.caddies?.length && <p className="text-sm text-charcoal-500">Nobody assigned.</p>}
  </div>);
}

export function CourseMap({ compact = false }: { compact?: boolean }) {
  const { db, advanceClock } = useStore();
  const [off, setOff] = useState(0); const [playing, setPlaying] = useState(true); const [speed, setSpeed] = useState(3); const [names, setNames] = useState(true);
  const [sel, setSel] = useState<number | null>(null); const [hover, setHover] = useState<number | null>(null); const [q, setQ] = useState(""); const [barn, setBarn] = useState(true);
  useEffect(() => { if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setPlaying(false); }, []);
  const lastFrame = useRef(0);
  useEffect(() => {
    if (!playing) return; let raf = 0; let last = performance.now(); lastFrame.current = last;
    const tick = (now: number) => { raf = requestAnimationFrame(tick); if (document.hidden) { last = now; return; } if (now - lastFrame.current < 33) return; const dt = (now - last) / 1000; last = now; lastFrame.current = now; setOff((o) => o + dt * speed); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  const tracks = useMemo(() => allTracks(db, off), [db, off]);
  const out = tracks.filter((t) => t.zone === "course" || t.zone === "clubhouse"); const t = sel ? tracks.find((x) => x.no === sel) ?? null : null; const cart = t ? db.carts.find((c) => c.id === t.cartId) : undefined; const book = t?.bookingId ? db.bookings.find((b) => b.id === t.bookingId) : undefined;
  const match = (x: CartTrack) => !q.trim() || String(x.no) === q.replace("#", "").trim();
  const vNow = addMinTs(db.meta.now, Math.floor(off)); const closures = db.closures.filter((c) => c.active && c.date === db.meta.now.slice(0, 10));
  const hazKey = useMemo(() => db.holes.map((h) => { const p = holePlayability({ ...db, meta: { ...db.meta, now: vNow } }, h.no); return p.label === "Playable" ? "" : `${h.no}:${p.label === "Closed" ? "closed" : "restricted"}`; }).filter(Boolean).join(","), [db, vNow]);
  const counts = { out: out.length, barn: tracks.filter((x) => x.zone === "barn").length, shed: tracks.filter((x) => x.zone === "shed").length, tee: tracks.filter((x) => x.zone === "tee").length };
  const hoverT = hover ? tracks.find((x) => x.no === hover) : undefined; const card = hoverT ?? t ?? undefined;
  const tagged = new Set<string>(); const tags = names ? tracks.filter((x) => (x.zone === "course" || x.zone === "tee") && x.bookingId && match(x)).filter((x) => { if (tagged.has(x.bookingId!)) return false; tagged.add(x.bookingId!); return true; }) : [];
  const ahead = Math.floor(off);
  return (
    <div className="space-y-4">
      <Notice tone="warn" className="items-center"><FlaskConical className="h-4 w-4 shrink-0" /><span><b>Simulated positions.</b> No GPS hardware is connected in this demo — carts are placed from each flight&apos;s progress. Press <b>Play</b> to watch them move; use <b>Apply to demo clock</b> to make the movement count.</span></Notice>
      <div className={cn("grid gap-4", compact ? "xl:grid-cols-3" : "xl:grid-cols-4")}>
        <Card className={cn("overflow-hidden", compact ? "xl:col-span-2" : "xl:col-span-3")}>
          <CardHeader title="Live course map" sub={`${counts.out} on course · ${counts.tee} at tee · ${counts.barn} at barn · ${counts.shed} in maintenance`}
            action={<div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant={playing ? "soft" : "primary"} onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause animation" : "Play animation"}>{playing ? <><Pause className="h-4 w-4" />Pause</> : <><Play className="h-4 w-4" />Play</>}</Button>
              <div role="group" aria-label="Animation speed" className="inline-flex overflow-hidden rounded-lg border border-line text-xs">{[[1, "Slow"], [3, "Normal"], [8, "Fast"]].map(([s, l]) => <button key={String(s)} onClick={() => setSpeed(Number(s))} className={cn("px-2.5 py-1.5 font-medium", speed === s ? "bg-forest text-white" : "bg-white text-charcoal-600 hover:bg-ivory-50")}>{l}</button>)}</div>
              <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-charcoal-400" /><Input className="h-9 w-28 pl-8" placeholder="Cart #" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find cart number" /></div>
            </div>} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-line bg-ivory-50 px-5 py-2 text-xs">
            <span className="font-medium text-forest">Map time {fmt12(vNow.slice(11))}{ahead > 0 ? <span className="ml-1 text-gold-700">(+{ahead} min ahead of demo clock)</span> : <span className="ml-1 text-charcoal-400">(in sync)</span>}</span>
            <span className="flex gap-1"><button disabled={off === 0} onClick={() => setOff(0)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-charcoal-600 hover:bg-charcoal-100 disabled:opacity-40"><RefreshCw className="h-3 w-3" />Sync</button><button disabled={ahead < 1} onClick={() => { advanceClock(ahead); setOff(off - ahead); }} className="inline-flex items-center gap-1 rounded-md bg-forest-50 px-2 py-1 font-medium text-forest hover:bg-forest-100 disabled:opacity-40"><FastForward className="h-3 w-3" />Apply to demo clock</button></span>
            <label className="ml-auto flex items-center gap-1.5 text-charcoal-600"><input type="checkbox" checked={names} onChange={(e) => setNames(e.target.checked)} /><Tag className="h-3 w-3" />Name tags</label><label className="flex items-center gap-1.5 text-charcoal-600"><input type="checkbox" checked={barn} onChange={(e) => setBarn(e.target.checked)} />Parked carts</label>
          </div>
          <div className="relative bg-[#CFE3C9]" onMouseLeave={() => setHover(null)}>
            <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="block h-auto w-full" role="img" aria-label="Golf course map with live cart positions">
              <StaticLayer hazKey={hazKey} />
              {/* trails */}
              {out.filter(match).map((x) => { const tr = trailOf(x); return tr ? <g key={"t" + x.cartId}><polyline points={tr} fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" opacity=".35" /><polyline points={tr} fill="none" stroke={x.hazard ? "#B4473A" : "#0F3D2E"} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 7" opacity=".75" /></g> : null; })}
              {/* carts */}
              {tracks.filter((x) => (barn || x.zone !== "barn") && match(x)).sort((a, b) => (a.zone === "course" ? 1 : 0) - (b.zone === "course" ? 1 : 0)).map((x) => {
                const c = db.carts.find((k) => k.id === x.cartId)!; const active = x.zone === "course" || x.zone === "clubhouse"; const isSel = sel === x.no; const col = x.hazard ? "#B4473A" : COLOR[c.status]; const moving = active && x.speedKmh > 0;
                return (
                  <g key={x.cartId} transform={`translate(${x.x.toFixed(1)},${x.y.toFixed(1)})`} className="cursor-pointer" onClick={() => setSel(isSel ? null : x.no)} onMouseEnter={() => setHover(x.no)} role="button" aria-label={`Cart ${x.no}, ${c.status}${x.riders?.length ? ", " + x.riders.map((r) => r.name).join(", ") : ""}`}>
                    {active && <circle r="16" fill={col} opacity=".2"><animate attributeName="r" values="10;21;10" dur="2.2s" repeatCount="indefinite" /><animate attributeName="opacity" values=".32;0;.32" dur="2.2s" repeatCount="indefinite" /></circle>}
                    {isSel && <circle r="19" fill="none" stroke="#B8975A" strokeWidth="3" />}
                    {active ? (
                      <g>
                        <g transform={`rotate(${x.heading.toFixed(0)})`}>
                          <rect x="-12" y="-7" width="24" height="14" rx="5" fill={col} stroke="#fff" strokeWidth="2" /><rect x="-6" y="-9" width="14" height="3" rx="1.5" fill="#fff" opacity=".85" />
                          <path d="M12,0 L8,-3.4 L8,3.4 Z" fill="#fff" opacity=".95" />
                          {(x.riders ?? []).slice(0, 2).map((r, i) => <circle key={i} cx={-4 + i * 7} cy="0" r="2.9" fill={TYPE_COLOR[r.type]} stroke="#fff" strokeWidth="1" />)}
                          {(x.caddies?.length ?? 0) > 0 && <circle cx="-15" cy="0" r="3.2" fill="#B8975A" stroke="#fff" strokeWidth="1.2" />}
                        </g>
                        <g transform="translate(0,-17)"><circle r="8.5" fill="#fff" stroke={col} strokeWidth="2" /><text y="3.6" textAnchor="middle" fontSize="10" fontWeight="800" fill={col}>{x.no}</text></g>
                        {moving && <circle cx="0" cy="12" r="2" fill="#0A2C21" opacity=".25"><animate attributeName="opacity" values=".3;0;.3" dur=".7s" repeatCount="indefinite" /></circle>}
                      </g>
                    ) : <rect x="-6" y="-5" width="12" height="10" rx="3" fill={col} stroke="#fff" strokeWidth="1.2" />}
                    {x.hazard && <text x="12" y="-18" fontSize="14">⚠</text>}
                  </g>); })}
              {/* flight name tags */}
              {tags.map((x) => { const b = db.bookings.find((k) => k.id === x.bookingId); if (!b) return null; const who = `${first(b.players[0].name)}${b.players.length > 1 ? ` +${b.players.length - 1}` : ""}`; const cad = db.caddieAssignments.filter((a) => a.bookingId === b.id && ["reserved", "assigned", "on_course"].includes(a.status)).map((a) => first(db.caddies.find((c) => c.id === a.caddieId)?.name ?? "")).filter(Boolean); const l2 = cad.length ? `Caddie ${cad.slice(0, 2).join(" & ")}` : "no caddie"; const w = Math.max(who.length, l2.length) * 5.4 + 14; const flip = x.x > MAP_W - 150;
                return <g key={"tag" + x.bookingId} transform={`translate(${(x.x + (flip ? -16 - w : 16)).toFixed(1)},${(x.y - 36).toFixed(1)})`} pointerEvents="none"><rect width={w} height="26" rx="6" fill="#fff" opacity=".93" stroke="#E6E1D1" /><text x="7" y="11" fontSize="9.5" fontWeight="700" fill="#0F3D2E">{who}</text><text x="7" y="21.5" fontSize="8.5" fill="#7C6234">{l2}</text></g>; })}
            </svg>
            {card && (
              <div className="pointer-events-none absolute z-10 w-64 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-white p-3 shadow-lift" style={{ left: `${Math.min(88, Math.max(12, (card.x / MAP_W) * 100))}%`, top: `${Math.max(22, (card.y / MAP_H) * 100 - 3)}%` }}>
                <div className="mb-1.5 flex items-center justify-between"><b className="text-sm text-forest">Cart #{card.no}</b><span className="text-[11px] text-charcoal-500">{card.zone === "course" ? `Hole ${card.hole}` : card.zone}</span></div>
                {card.flightLabel && <p className="mb-1.5 text-xs text-charcoal-500">{card.flightLabel}</p>}<CrewChips t={card} size={22} />
              </div>)}
            <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 rounded-xl bg-white/90 px-3 py-2 text-[11px] shadow-card backdrop-blur">{Object.entries(COLOR).filter(([k]) => k !== "inspection" && k !== "returned").map(([k, c]) => <span key={k} className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{k.replace("_", " ")}</span>)}<span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full border border-charcoal-300 bg-white" />public</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: "#B8975A" }} />caddie</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#D98E04]/70" />restricted</span></div>
            <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-xl bg-white/90 px-3 py-1.5 text-[11px] text-charcoal-600 shadow-card">{playing && <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald opacity-70" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald" /></span>}{playing ? "Live" : "Paused"} · <span className="font-semibold text-[#8A5A00]">simulated</span></div>
          </div>
        </Card>

        <div className="space-y-4">
          {t && cart ? (
            <Card className="border-gold-300"><CardHeader title={<span className="flex items-center gap-2">Cart #{t.no}<StatusBadge status={cart.status} /></span>} sub={`${cart.type} · ${cart.fuel === "electric" ? "electric" : "gas"}`} action={<button className="text-xs text-charcoal-400 hover:text-charcoal" onClick={() => setSel(null)}>Close</button>} />
              <div className="space-y-3 p-4 text-sm">
                {book ? <div><p className="font-medium text-forest">{book.contactName} <span className="text-xs font-normal text-charcoal-500">{book.ref}</span></p><p className="text-xs text-charcoal-500">Tee {fmt12(book.time)} · {book.players.length} golfers · {cartsFor(db, book.id).length} cart(s)</p></div> : <p className="text-charcoal-500">Not assigned to a flight.</p>}
                {book && <div><p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-charcoal-500"><Users className="h-3.5 w-3.5" />On this cart</p><CrewChips t={t} /></div>}
                {t.zone === "course" && <div className="space-y-2"><div className="flex items-center justify-between"><span className="text-charcoal-500">Position</span><b>Hole {t.hole} of {book?.holes ?? 18}</b></div><Progress value={t.progress ?? 0} tone={t.paceStatus === "behind" ? "red" : "green"} />
                  <div className="flex items-center justify-between"><span className="text-charcoal-500">Pace</span>{t.paceStatus === "behind" ? <Badge tone="red">{t.behindMin} min behind</Badge> : <Badge tone="green">on pace</Badge>}</div>
                  <div className="flex justify-between"><span className="text-charcoal-500">Time on course</span><b>{Math.floor((t.elapsedMin ?? 0) / 60)}h {(t.elapsedMin ?? 0) % 60}m</b></div></div>}
                {t.zone === "clubhouse" && <Notice tone="ok" className="py-1.5 text-xs">Back at the clubhouse — ready to be returned.</Notice>}
                {t.hazard && <Notice tone="error" className="py-1.5 text-xs">On a {t.hazard.kind} hole: {t.hazard.reason}</Notice>}
                <div className="grid grid-cols-2 gap-2 border-t border-line pt-2 text-xs"><div><p className="text-charcoal-400">Speed</p><b>{t.speedKmh} km/h</b></div><div><p className="text-charcoal-400">Battery</p><b className={t.battery !== null && t.battery < 20 ? "text-[#9C3326]" : ""}>{t.battery === null ? "gas" : `${t.battery}%`}</b></div><div><p className="text-charcoal-400">GPS accuracy</p><b>±{t.accuracyM} m</b></div><div><p className="text-charcoal-400">Last ping</p><b>{t.lastPingSec}s ago</b></div></div>
                <p className="text-[11px] text-charcoal-400">Dispatched {fmtTs(cart.dispatchedAt)} · values simulated</p>
                <div className="flex flex-wrap gap-3 text-xs"><Link className="font-medium text-emerald underline" href="/carts">Cart dispatch →</Link>{book && <Link className="font-medium text-emerald underline" href="/check-in?tab=starter">Flight →</Link>}</div>
              </div></Card>
          ) : null}
          <Card><CardHeader title="Carts on the course" sub={`${out.length} out now`} />
            {out.length === 0 ? <p className="p-5 text-sm text-charcoal-500">No carts on the course at this time.</p> : <ul className="scroll-thin max-h-[440px] divide-y divide-line/60 overflow-y-auto">{[...out].sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0)).map((x) => (
              <li key={x.cartId}><button onClick={() => setSel(x.no)} onMouseEnter={() => setHover(x.no)} onMouseLeave={() => setHover(null)} className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-ivory-50", sel === x.no && "bg-gold-50")}>
                <span className={cn("grid h-8 w-10 shrink-0 place-items-center rounded-lg text-xs font-bold text-white", x.hazard ? "bg-[#B4473A]" : "bg-forest")}>{x.no}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{(x.riders ?? []).map((r) => first(r.name)).join(", ") || x.flightLabel}</span><span className="flex flex-wrap items-center gap-x-2 text-xs text-charcoal-500"><Navigation className="h-3 w-3" />Hole {x.hole}{(x.caddies?.length ?? 0) > 0 && <span>· caddie {x.caddies!.map((c) => first(c.name)).join(", ")}</span>}{x.paceStatus === "behind" && <Badge tone="red" className="py-0">+{x.behindMin}m</Badge>}{x.hazard && <Badge tone="red" className="py-0">restricted</Badge>}{x.overdue && <Badge tone="amber" className="py-0">overdue</Badge>}</span></span>
                <span className="w-10 text-right text-xs tabular-nums text-charcoal-500">{Math.round((x.progress ?? 0) * 100)}%</span></button></li>))}</ul>}</Card>
          {closures.length > 0 && <Card><CardHeader title="Active restrictions today" /><ul className="divide-y divide-line/60 text-sm">{closures.map((c) => <li key={c.id} className="px-4 py-2.5"><Badge tone={c.type === "partial" ? "amber" : "red"}>{c.type === "partial" ? `holes ${c.holes.join(", ")}` : c.type}</Badge> <span className="text-xs text-charcoal-500">{fmt12(c.from)}–{fmt12(c.to)}</span><p className="mt-0.5 text-xs">{c.reason}</p></li>)}</ul></Card>}
        </div>
      </div>
    </div>
  );
}
