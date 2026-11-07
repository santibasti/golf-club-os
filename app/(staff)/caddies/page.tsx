"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { Avatar, Badge, Button, Card, CardHeader, DataTable, Empty, Field, Input, KV, Kpi, Modal, Notice, PageHeader, PromptDialog, Select, StatusBadge, Tabs, Textarea, cn } from "@/components/ui";
import * as Cd from "@/lib/services/caddie";
import { chargeNet } from "@/lib/services/finance";
import { fmt12, fmtShort, fmtTs } from "@/lib/time";
import { peso } from "@/lib/format";
import type { Caddie } from "@/lib/types";
import { caddieCounts } from "@/lib/services/metrics";

function CaddieProfile({ id, onClose }: { id: string; onClose: () => void }) {
  const { db, act, can } = useStore(); const c = db.caddies.find((x) => x.id === id); const [txt, setTxt] = useState(""); const [sev, setSev] = useState<"minor" | "major">("minor");
  if (!c) return null; const as = db.caddieAssignments.filter((a) => a.caddieId === id && a.status === "completed").slice(-8).reverse(); const att = db.caddieAttendance.filter((a) => a.caddieId === id).slice(-10).reverse();
  return (
    <Modal open onClose={onClose} size="lg" title={<span className="flex items-center gap-3"><Avatar name={c.name} seed={c.colorSeed} />{c.name} <StatusBadge status={c.status} /></span>}>
      <div className="grid gap-5 md:grid-cols-2">
        <div><KV k="Caddie ID" v={c.id} /><KV k="Contact" v={c.phone} /><KV k="Classification" v={c.classification} /><KV k="Skill category" v={c.category} /><KV k="Assignment priority" v={c.priority} /><KV k="Rounds today" v={Cd.roundsToday(db, id)} /><KV k="Completed rounds (career)" v={Cd.completedRounds(db, c)} /><KV k="Total service fees" v={peso(Cd.totalFees(db, c))} /><KV k="Notes" v={c.notes || "—"} />
          <p className="mt-2 text-xs text-charcoal-500">Fee arrangement: {db.settings.rates.caddieClubSharePct[c.classification]}% of service fee retained by the club; the rest is a payable to the caddie.</p></div>
        <div><h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-charcoal-500">Attendance history</h4><ul className="mb-3 text-sm">{att.length === 0 && <li className="text-charcoal-400">No records</li>}{att.map((a) => <li key={a.id} className="flex justify-between border-b border-charcoal-100/60 py-1"><span>{fmtShort(a.date)}</span><span className="text-xs text-charcoal-500">{a.timeIn ?? "—"} → {a.timeOut ?? "—"} <Badge tone={a.status === "present" ? "green" : a.status === "late" ? "amber" : "neutral"}>{a.status}</Badge></span></li>)}</ul>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-charcoal-500">Recent rounds</h4><ul className="text-sm">{as.map((a) => <li key={a.id} className="flex justify-between border-b border-charcoal-100/60 py-1"><span>{fmtShort(a.date)} · {a.bookingId}</span><b>{peso(a.fee + a.special + a.extra + a.tip)}</b></li>)}</ul></div>
      </div>
      <h4 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-charcoal-500">Incident records</h4>
      {c.incidents.length === 0 ? <p className="text-sm text-charcoal-400">None</p> : <ul className="text-sm">{c.incidents.map((i) => <li key={i.id} className="py-1"><Badge tone={i.severity === "major" ? "red" : "amber"}>{i.severity}</Badge> {i.text} <span className="text-xs text-charcoal-400">— {fmtTs(i.at)}, {i.by}</span></li>)}</ul>}
      {can("caddie.manage") && <div className="mt-3 flex flex-wrap items-end gap-2"><Field label="Add incident / performance note" className="min-w-[14rem] flex-1"><Input value={txt} onChange={(e) => setTxt(e.target.value)} /></Field><Select value={sev} onChange={(e) => setSev(e.target.value as "minor" | "major")} className="w-28"><option value="minor">Minor</option><option value="major">Major</option></Select><Button onClick={() => { if (act((d, ctx) => Cd.addCaddieIncident(d, ctx, id, sev, txt), "Incident recorded").ok) setTxt(""); }}>Record</Button></div>}
    </Modal>
  );
}

export default function CaddiesPage() {
  const { db, act, can } = useStore(); const sp = useSearchParams(); const [tab, setTab] = useState<"rotation" | "roster" | "attendance" | "settle">("rotation"); const [prof, setProf] = useState<string | null>(sp.get("caddie"));
  const [pick, setPick] = useState<Record<string, { caddie: string; mode: "preferred" | "override"; reason: string }>>({}); const [replace, setReplace] = useState<{ id: string; to: string } | null>(null); const [unav, setUnav] = useState<string | null>(null);
  const [fee, setFee] = useState<{ id: string; special: number; extra: number; tip: number } | null>(null); const [filter, setFilter] = useState("all"); const [q, setQ] = useState("");
  useEffect(() => { if (sp.get("caddie")) setProf(sp.get("caddie")); }, [sp]);
  const today = db.meta.now.slice(0, 10); const queue = Cd.rotationQueue(db); const cc = caddieCounts(db); const mgr = can("caddie.manage"); const ovr = can("caddie.override");
  const needing = db.bookings.filter((b) => b.date === today && ["confirmed", "arrived", "ready"].includes(b.status) && Cd.bookingAssignments(db, b.id).length < Cd.requiredCaddies(db, b.id)).sort((a, b) => a.time.localeCompare(b.time));
  const active = db.caddieAssignments.filter((a) => ["reserved", "assigned", "on_course"].includes(a.status));
  const pendingSet = db.caddieSettlements.filter((s) => s.status === "pending"); const roster = db.caddies.filter((c) => (filter === "all" || c.status === filter || (filter === "present" && !["off", "absent", "day_off"].includes(c.status))) && (!q || c.name.toLowerCase().includes(q.toLowerCase()) || c.id.toLowerCase().includes(q.toLowerCase())));
  const nameOf = (id: string) => db.caddies.find((c) => c.id === id)?.name ?? id; const completedToday = db.caddieAssignments.filter((a) => a.date === today && a.status === "completed").length;
  const assign = (bid: string) => { const p = pick[bid]; if (p?.caddie) act((d, c) => Cd.assignCaddie(d, c, { bookingId: bid, caddieId: p.caddie, preferred: p.mode === "preferred", reason: p.reason }), p.mode === "preferred" ? "Preferred caddie assigned — exception recorded" : "Override recorded with reason"); else act((d, c) => Cd.assignCaddie(d, c, { bookingId: bid }), "Next caddie in rotation assigned"); };
  return (
    <>
      <PageHeader icon="Users" title="Caddie Management" sub={`Rotation rule: ${db.settings.rotation.mode === "fewest_rounds" ? "fewest rounds today, then longest wait" : "first in, first out"} (configurable in Administration)`} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7"><Kpi label="Total present" value={cc.present} icon="UserCheck" /><Kpi label="Available" value={cc.available} icon="UserRoundCheck" /><Kpi label="Assigned" value={cc.assigned} icon="Route" /><Kpi label="On course" value={cc.onCourse} icon="Flag" /><Kpi label="Returned" value={cc.returned} icon="Undo2" /><Kpi label="Rounds completed today" value={completedToday} icon="CheckCheck" /><Kpi label="Pending settlements" value={pendingSet.length} sub={peso(pendingSet.reduce((a, s) => a + s.payable, 0))} icon="Handshake" tone="gold" /></div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "rotation", label: "Rotation & assignment" }, { id: "roster", label: "Caddie database", count: db.caddies.length }, { id: "attendance", label: "Attendance" }, { id: "settle", label: "Fees & settlements", count: pendingSet.length }]} />

      {tab === "rotation" && <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2"><CardHeader title="Live rotation queue" sub={`${queue.length} available · next up highlighted`} />
          {queue.length === 0 ? <Empty icon="UserX" title="Queue empty" text="Time-in caddies from the roster." /> : <ol className="scroll-thin max-h-[560px] divide-y divide-charcoal-100/70 overflow-y-auto">{queue.map((c, i) => (
            <li key={c.id} className={cn("flex items-center gap-3 px-4 py-2.5", i === 0 && "bg-gold-50")}><span className={cn("grid h-7 w-7 place-items-center rounded-full text-xs font-bold", i === 0 ? "bg-gold text-white" : "bg-charcoal-100 text-charcoal-600")}>{i + 1}</span><Avatar name={c.name} seed={c.colorSeed} size={30} />
              <button className="min-w-0 flex-1 text-left" onClick={() => setProf(c.id)}><span className="block truncate text-sm font-medium">{c.name}</span><span className="block text-xs text-charcoal-500">{c.id} · cat {c.category} · {c.classification} · {Cd.roundsToday(db, c.id)} round(s) today</span></button>
              {mgr && <Button size="sm" variant="ghost" onClick={() => setUnav(c.id)}>Unavailable</Button>}</li>))}</ol>}
        </Card>
        <div className="space-y-4 xl:col-span-3">
          <Card><CardHeader title="Flights needing caddies" sub="Assign the next caddie, or accommodate a preferred request / override (reason required, recorded)" />
            {needing.length === 0 ? <Empty icon="CheckCircle2" title="All caddie requirements are covered" /> : needing.map((b) => { const need = Cd.requiredCaddies(db, b.id), have = Cd.bookingAssignments(db, b.id).length; const p = pick[b.id]; return (
              <div key={b.id} className="border-b border-charcoal-100/70 px-5 py-3 last:border-0">
                <div className="flex flex-wrap items-center gap-2"><b>{fmt12(b.time)}</b><span className="text-sm">{b.contactName}</span><StatusBadge status={b.status} /><Badge>{have}/{need} caddies</Badge>{b.preferredCaddieId && <Badge tone="gold">requested: {nameOf(b.preferredCaddieId)}</Badge>}<Button size="sm" className="ml-auto" disabled={!mgr || queue.length === 0} onClick={() => assign(b.id)}>{p?.caddie ? "Assign selected" : `Assign next${queue[0] ? ` (${queue[0].name.split(" ")[0]})` : ""}`}</Button></div>
                {b.notes && <p className="mt-1 text-xs text-charcoal-500">Note: {b.notes}</p>}
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_9rem_1fr]"><Select aria-label="Specific caddie" value={p?.caddie ?? ""} onChange={(e) => setPick({ ...pick, [b.id]: { ...{ mode: "preferred" as const, reason: "" }, ...pick[b.id], caddie: e.target.value } })}><option value="">Next in queue (no exception)</option>{queue.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}</Select>
                  <Select aria-label="Exception type" disabled={!p?.caddie} value={p?.mode ?? "preferred"} onChange={(e) => setPick({ ...pick, [b.id]: { ...p!, mode: e.target.value as "preferred" | "override" } })}><option value="preferred">Preferred request</option><option value="override" disabled={!ovr}>Rotation override{ovr ? "" : " (no permission)"}</option></Select>
                  <Input disabled={!p?.caddie} placeholder="Reason (required for exceptions)" value={p?.reason ?? ""} onChange={(e) => setPick({ ...pick, [b.id]: { ...p!, reason: e.target.value } })} /></div>
              </div>); })}</Card>
          <Card><CardHeader title="Active assignments" sub="Reserved → Assigned → On course. A caddie cannot hold two active rounds." />
            <DataTable dense rows={active} rowKey={(a) => a.id} empty={<Empty title="No active assignments" />} columns={[
              { key: "c", header: "Caddie", render: (a) => <button className="font-medium hover:underline" onClick={() => setProf(a.caddieId)}>{nameOf(a.caddieId)}</button> }, { key: "b", header: "Flight", render: (a) => { const b = db.bookings.find((x) => x.id === a.bookingId); return b ? `${fmt12(b.time)} · ${b.contactName}` : a.bookingId; } }, { key: "s", header: "Status", render: (a) => <StatusBadge status={a.status} /> },
              { key: "f", header: "Fee", align: "right", render: (a) => peso(a.fee + a.special + a.extra + a.tip) }, { key: "x", header: "", render: (a) => mgr && <div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => setReplace({ id: a.id, to: "" })}>Replace</Button><Button size="sm" variant="ghost" onClick={() => setFee({ id: a.id, special: a.special, extra: a.extra, tip: a.tip })}>Fees / tip</Button></div> }]} /></Card>
          {db.caddies.some((c) => c.status === "returned") && <Card><CardHeader title="Returned — release to queue" sub="Caddie goes to the back of the rotation" /><div className="flex flex-wrap gap-2 p-4">{db.caddies.filter((c) => c.status === "returned").map((c) => <Button key={c.id} variant="outline" size="sm" disabled={!mgr} onClick={() => act((d, ctx) => Cd.releaseToQueue(d, ctx, c.id), `${c.name} released to queue`)}>{c.name}</Button>)}</div></Card>}
          <Card><CardHeader title="Rotation exceptions log" sub="Preferred requests, overrides and replacements" /><DataTable dense rows={[...db.rotationEvents].reverse().filter((e) => ["preferred", "override", "replace", "unavailable"].includes(e.type)).slice(0, 12)} rowKey={(e) => e.id} empty={<Empty title="No exceptions yet" />} columns={[{ key: "a", header: "When", render: (e) => fmtTs(e.at) }, { key: "t", header: "Type", render: (e) => <Badge tone={e.type === "override" ? "red" : "gold"}>{e.type}</Badge> }, { key: "c", header: "Caddie", render: (e) => nameOf(e.caddieId) }, { key: "r", header: "Reason", render: (e) => <span className="text-xs">{e.reason}</span> }, { key: "b", header: "By", render: (e) => e.by }]} /></Card>
        </div>
      </div>}

      {tab === "roster" && <Card><div className="flex flex-wrap gap-2 border-b border-charcoal-100 p-4"><Input className="max-w-xs" placeholder="Search caddie…" value={q} onChange={(e) => setQ(e.target.value)} /><Select className="w-44" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All caddies</option><option value="present">Present today</option>{["available", "reserved", "assigned", "on_course", "returned", "unavailable", "absent", "day_off", "off"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</Select></div>
        <DataTable rows={roster} rowKey={(c) => c.id} maxRows={25} columns={[
          { key: "n", header: "Caddie", sortValue: (c) => c.name, render: (c) => <button className="flex items-center gap-2 text-left hover:underline" onClick={() => setProf(c.id)}><Avatar name={c.name} seed={c.colorSeed} size={28} /><span>{c.name}<span className="block text-xs text-charcoal-400">{c.id} · {c.phone}</span></span></button> },
          { key: "c", header: "Class", render: (c) => <span className="text-xs capitalize">{c.classification}</span> }, { key: "k", header: "Cat", render: (c) => c.category }, { key: "s", header: "Status", render: (c) => <StatusBadge status={c.status} /> },
          { key: "r", header: "Today", align: "right", sortValue: (c) => Cd.roundsToday(db, c.id), render: (c) => Cd.roundsToday(db, c.id) }, { key: "t", header: "Career rounds", align: "right", sortValue: (c) => Cd.completedRounds(db, c), render: (c) => Cd.completedRounds(db, c) },
          { key: "f", header: "Fees", align: "right", render: (c) => peso(Cd.totalFees(db, c)) },
          { key: "a", header: "", render: (c: Caddie) => mgr && <div className="flex flex-wrap gap-1">{["off", "absent", "day_off", "unavailable"].includes(c.status) && <Button size="sm" onClick={() => act((d, ctx) => Cd.caddieCheckIn(d, ctx, c.id), `${c.name} timed in — added to queue`)}>Time-in</Button>}{["available", "returned"].includes(c.status) && <Button size="sm" variant="outline" onClick={() => act((d, ctx) => { if (c.status === "returned") Cd.releaseToQueue(d, ctx, c.id); Cd.caddieCheckOut(d, ctx, c.id); }, `${c.name} timed out`)}>Time-out</Button>}{["off"].includes(c.status) && <Button size="sm" variant="ghost" onClick={() => act((d, ctx) => Cd.setCaddieStatus(d, ctx, c.id, "absent", "Marked absent"), "Marked absent")}>Absent</Button>}</div> }]} /></Card>}

      {tab === "attendance" && <Card><CardHeader title={`Attendance — ${fmtShort(today)}`} sub="Time-in/out, status and availability" />
        <DataTable dense rows={db.caddies.map((c) => ({ c, a: Cd.attendanceToday(db, c.id) }))} rowKey={(r) => r.c.id} maxRows={30} columns={[{ key: "n", header: "Caddie", render: (r) => r.c.name }, { key: "i", header: "Time-in", render: (r) => r.a?.timeIn ? fmt12(r.a.timeIn) : "—" }, { key: "o", header: "Time-out", render: (r) => r.a?.timeOut ? fmt12(r.a.timeOut) : "—" }, { key: "s", header: "Attendance", render: (r) => r.a ? <Badge tone={r.a.status === "present" ? "green" : r.a.status === "late" ? "amber" : "neutral"}>{r.a.status.replace("_", " ")}</Badge> : <span className="text-xs text-charcoal-400">no record</span> }, { key: "v", header: "Available for assignment", render: (r) => r.c.status === "available" ? <Badge tone="green">yes</Badge> : <Badge>no</Badge> }]} /></Card>}

      {tab === "settle" && <div className="space-y-4">
        <Notice tone="info">Caddie fees are <b>not always club revenue</b>. Employee caddies: 100% club revenue. Contractor/freelance: the club collects for them and records a payable{" "}(club share is configurable per classification in Administration). Settlement is allowed only after the customer has paid.</Notice>
        <Card><CardHeader title="Settlements" /><DataTable rows={[...db.caddieSettlements].reverse()} maxRows={20} rowKey={(s) => s.id} empty={<Empty icon="Handshake" title="No settlements yet" text="Settlements are created when contractor caddies complete rounds." />} columns={[
          { key: "d", header: "Date", render: (s) => fmtShort(s.date) }, { key: "c", header: "Caddie", render: (s) => nameOf(s.caddieId) }, { key: "g", header: "Gross", align: "right", render: (s) => peso(s.gross) }, { key: "k", header: "Club retained", align: "right", render: (s) => peso(s.clubRetained) }, { key: "p", header: "Payable", align: "right", render: (s) => <b>{peso(s.payable)}</b> },
          { key: "col", header: "Customer paid?", render: (s) => { const ch = db.charges.find((x) => x.id === s.chargeId); return ch && ch.paid >= chargeNet(ch) - 0.005 ? <Badge tone="green">collected</Badge> : <Badge tone="amber">not yet</Badge>; } }, { key: "s", header: "Status", render: (s) => <StatusBadge status={s.status} /> },
          { key: "a", header: "", render: (s) => s.status === "pending" && can("caddie.settle") && <Button size="sm" onClick={() => act((d, c) => Cd.settleCaddie(d, c, s.id), "Settlement recorded")}>Settle</Button> }]} /></Card></div>}

      {prof && <CaddieProfile id={prof} onClose={() => setProf(null)} />}
      <PromptDialog open={!!unav} onClose={() => setUnav(null)} title="Mark caddie unavailable" label="Reason" onSubmit={(v) => act((d, c) => Cd.setCaddieStatus(d, c, unav!, "unavailable", v), "Caddie marked unavailable")} />
      <Modal open={!!replace} onClose={() => setReplace(null)} title="Replace assigned caddie" size="sm" footer={<><Button variant="outline" onClick={() => setReplace(null)}>Cancel</Button><PromptDialogButton onGo={(reason) => { if (replace?.to && act((d, c) => Cd.replaceCaddie(d, c, replace.id, replace.to, reason), "Caddie replaced — recorded in rotation log").ok) setReplace(null); }} disabled={!replace?.to} /></>}>
        <Field label="Replacement (from available queue)"><Select value={replace?.to ?? ""} onChange={(e) => setReplace({ ...replace!, to: e.target.value })}><option value="">Select…</option>{queue.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field></Modal>
      <Modal open={!!fee} onClose={() => setFee(null)} title="Special fees & tip" size="sm" footer={<><Button variant="outline" onClick={() => setFee(null)}>Cancel</Button><Button onClick={() => { if (!fee) return; const r1 = act((d, c) => { Cd.setSpecialFee(d, c, fee.id, fee.special, fee.extra); const a = d.caddieAssignments.find((x) => x.id === fee.id)!; if (["assigned", "on_course"].includes(a.status)) Cd.recordTip(d, c, fee.id, fee.tip); }, "Fees saved"); if (r1.ok) setFee(null); }}>Save</Button></>}>
        {fee && <div className="space-y-3"><Field label="Special service fee"><Input type="number" min={0} value={fee.special} onChange={(e) => setFee({ ...fee, special: Number(e.target.value) })} /></Field><Field label="Additional approved charges"><Input type="number" min={0} value={fee.extra} onChange={(e) => setFee({ ...fee, extra: Number(e.target.value) })} /></Field><Field label="Tip (passes through to caddie, not revenue)"><Input type="number" min={0} value={fee.tip} onChange={(e) => setFee({ ...fee, tip: Number(e.target.value) })} /></Field></div>}</Modal>
    </>
  );
}
function PromptDialogButton({ onGo, disabled }: { onGo: (reason: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return <><Button disabled={disabled} onClick={() => setOpen(true)}>Replace…</Button><PromptDialog open={open} onClose={() => setOpen(false)} title="Replacement reason" label="Reason" onSubmit={onGo} /></>;
}
void KV; void Textarea; void useMemo;
