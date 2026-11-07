/**
 * Cart tracking & course geometry.
 * DEMO: positions are SIMULATED — derived deterministically from flight progress (demo clock, pace checkpoints), not from real GPS.
 * PRODUCTION: replace `cartTrack` with a read of the latest `cart_positions` row per cart (see docs/GPS_INTEGRATION.md);
 * the map, alerts and UI consume only the `CartTrack` shape below, so they do not change.
 */
import type { Cart, DB } from "../types";
import { paceOf, roundOf } from "./flight";
import { holePlayability } from "./maintenance";
import { cartsFor } from "./cart";
import { minsBetween } from "../time";

export const MAP_W = 1000, MAP_H = 720;
export type Pt = { x: number; y: number };
export const CLUBHOUSE: Pt = { x: 500, y: 628 }, BARN: Pt = { x: 585, y: 652 }, SHED: Pt = { x: 705, y: 660 }, RANGE: Pt = { x: 215, y: 640 };

/** [tee, green] per hole (stylised routing, front nine west loop, back nine east loop). */
const TG: [Pt, Pt][] = [
  [{ x: 470, y: 600 }, { x: 330, y: 540 }], [{ x: 316, y: 520 }, { x: 170, y: 452 }], [{ x: 160, y: 430 }, { x: 160, y: 336 }], [{ x: 172, y: 312 }, { x: 262, y: 172 }], [{ x: 282, y: 160 }, { x: 430, y: 92 }],
  [{ x: 452, y: 92 }, { x: 472, y: 204 }], [{ x: 482, y: 224 }, { x: 384, y: 332 }], [{ x: 372, y: 348 }, { x: 382, y: 424 }], [{ x: 392, y: 444 }, { x: 480, y: 590 }],
  [{ x: 526, y: 596 }, { x: 640, y: 540 }], [{ x: 654, y: 520 }, { x: 790, y: 470 }], [{ x: 802, y: 456 }, { x: 832, y: 382 }], [{ x: 832, y: 360 }, { x: 760, y: 202 }], [{ x: 748, y: 190 }, { x: 622, y: 102 }],
  [{ x: 610, y: 112 }, { x: 600, y: 232 }], [{ x: 612, y: 252 }, { x: 700, y: 302 }], [{ x: 702, y: 322 }, { x: 722, y: 440 }], [{ x: 704, y: 462 }, { x: 548, y: 584 }],
];
const bendOf = (n: number): Pt => { const [t, g] = TG[n - 1]; const mx = (t.x + g.x) / 2, my = (t.y + g.y) / 2; const dx = g.x - t.x, dy = g.y - t.y; const len = Math.hypot(dx, dy) || 1; const off = (n % 2 ? 1 : -1) * (14 + ((n * 7) % 18)); return { x: mx - (dy / len) * off, y: my + (dx / len) * off }; };
export const HOLES_GEO = TG.map(([tee, green], i) => ({ no: i + 1, tee, green, bend: bendOf(i + 1) }));

function lerp(a: Pt, b: Pt, t: number): Pt { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
/** Position + heading at fractional hole progress p (0 = tee of hole 1; N = back at clubhouse). */
export function pathAt(p: number, holes: number): { pt: Pt; hole: number; u: number; heading: number } {
  const total = Math.max(0, Math.min(holes, p)); const idx = Math.min(holes - 1, Math.floor(total)); const u = total >= holes ? 1 : total - idx;
  const g = HOLES_GEO[idx]; const next = idx + 1 < holes ? HOLES_GEO[idx + 1].tee : CLUBHOUSE;
  const pts = [g.tee, g.bend, g.green, next]; const lens = [0, 1, 2].map((i) => Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y)); const sum = lens[0] + lens[1] + lens[2]; let d = u * sum; let seg = 0;
  while (seg < 2 && d > lens[seg]) { d -= lens[seg]; seg++; }
  const t = lens[seg] ? d / lens[seg] : 0; const a = pts[seg], b = pts[seg + 1];
  return { pt: lerp(a, b, t), hole: idx + 1, u, heading: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
}

export type CartZone = "course" | "tee" | "barn" | "shed" | "clubhouse";
export interface CartTrack {
  cartId: string; no: number; x: number; y: number; zone: CartZone; hole: number | null; progress: number | null; // progress 0..1 of the round
  speedKmh: number; heading: number; battery: number | null; accuracyM: number; lastPingSec: number; simulated: true;
  bookingId?: string; paceStatus?: string; behindMin?: number; flightLabel?: string; startedAt?: string; elapsedMin?: number; overdue?: boolean;
  hazard?: { kind: "restricted" | "closed"; reason?: string };
}
const barnSlot = (no: number): Pt => { const i = no - 1, col = i % 10, row = Math.floor(i / 10); return { x: BARN.x - 60 + col * 13, y: BARN.y - 8 + row * 13 }; };

export function cartTrack(db: DB, cart: Cart): CartTrack {
  const base = { cartId: cart.id, no: cart.no, speedKmh: 0, heading: 0, battery: cart.fuel === "electric" ? cart.battery : null, accuracyM: 3 + (cart.no % 4), lastPingSec: 2 + ((cart.no * 7) % 9), simulated: true as const, hole: null as number | null, progress: null as number | null };
  if (cart.status === "maintenance") return { ...base, ...{ x: SHED.x - 20 + (cart.no % 3) * 14, y: SHED.y + 4 }, zone: "shed" };
  if (["reserved", "dispatched"].includes(cart.status)) {
    const b = db.bookings.find((x) => x.id === cart.bookingId); const idx = b ? cartsFor(db, b.id).findIndex((c) => c.id === cart.id) : 0;
    return { ...base, x: HOLES_GEO[0].tee.x + 14 + idx * 12, y: HOLES_GEO[0].tee.y + 16, zone: "tee", bookingId: b?.id, flightLabel: b ? `${b.time} · ${b.contactName}` : undefined };
  }
  if (cart.status === "in_use" && cart.bookingId) {
    const b = db.bookings.find((x) => x.id === cart.bookingId); const r = b ? roundOf(db, b.id) : undefined;
    if (b && r?.startedAt) {
      const perHole = (b.holes === 18 ? db.settings.pace.minutes18 : db.settings.pace.minutes9) / b.holes; const lastCp = [...r.checkpoints].sort((a, c) => c.hole - a.hole)[0];
      const prog = lastCp ? lastCp.hole + minsBetween(lastCp.at, db.meta.now) / perHole : minsBetween(r.startedAt, db.meta.now) / perHole; const p = Math.max(0, Math.min(b.holes, prog));
      const pos = pathAt(p, b.holes); const idx = cartsFor(db, b.id).findIndex((c) => c.id === cart.id); const off = idx <= 0 ? 0 : 9 * (idx % 2 ? 1 : -1);
      const rad = ((pos.heading + 90) * Math.PI) / 180; const moving = pos.u < 0.5 || pos.u > 0.72; const pace = paceOf(db, b);
      return { ...base, x: pos.pt.x + Math.cos(rad) * off, y: pos.pt.y + Math.sin(rad) * off, zone: p >= b.holes ? "clubhouse" : "course", hole: Math.min(b.holes, pos.hole), progress: p / b.holes, speedKmh: moving ? 9 + (cart.no % 5) : 0, heading: pos.heading,
        battery: cart.fuel === "electric" ? Math.max(5, cart.battery - Math.round((p / b.holes) * 30)) : null, bookingId: b.id, paceStatus: pace.status, behindMin: pace.behindMin, flightLabel: `${b.time} · ${b.contactName}`, startedAt: r.startedAt, elapsedMin: minsBetween(r.startedAt, db.meta.now), overdue: p >= b.holes * 1.04 };
    }
  }
  // available / returned / inspection (or in_use without a started round) → parked at the cart barn
  return { ...base, ...barnSlot(cart.no), zone: "barn" };
}
export function allTracks(db: DB): CartTrack[] {
  return db.carts.map((c) => { const t = cartTrack(db, c); if (t.zone === "course" && t.hole) { const pl = holePlayability(db, t.hole); if (pl.label !== "Playable") t.hazard = { kind: pl.label === "Closed" ? "closed" : "restricted", reason: pl.reason }; } return t; });
}
