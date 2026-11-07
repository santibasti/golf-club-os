"use client";
import { useMemo, useState } from "react";
import { ChoiceGroup } from "@/components/choices";
import { Download } from "lucide-react";
import { useStore } from "@/lib/store";
import { Button, Card, CardHeader, DataTable, Field, Input, Kpi, PageHeader, Select, Empty } from "@/components/ui";
import { Chart } from "@/components/charts";
import { REPORTS, resolveRange } from "@/lib/services/reports";
import { addDays, fmtShort } from "@/lib/time";
import { toCSV } from "@/lib/format";
import { download } from "@/lib/download";

export default function ReportsPage() {
  const { db } = useStore(); const today = db.meta.now.slice(0, 10);
  const [rid, setRid] = useState(REPORTS[0].id); const [rk, setRk] = useState<"today" | "yesterday" | "7d" | "month" | "custom">("7d"); const [from, setFrom] = useState(addDays(today, -13)); const [to, setTo] = useState(today);
  const range = resolveRange(rk, today, { from, to }); const rep = REPORTS.find((r) => r.id === rid)!;
  const res = useMemo(() => rep.build(db, range), [db, rep, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <PageHeader icon="BarChart3" title="Reports & Analytics" sub="Reservation ≠ round played ≠ charge ≠ payment — each report states which record it counts" />
      <Card className="mb-5 p-4"><div className="grid gap-3 md:grid-cols-4">
        <Field label="Report" className="md:col-span-2"><Select value={rid} onChange={(e) => setRid(e.target.value)}>{REPORTS.map((r, i) => <option key={r.id} value={r.id}>{i + 1}. {r.title}</option>)}</Select></Field>
        <Field label="Period"><ChoiceGroup variant="segment" label="Period" value={rk} onChange={setRk} options={[{ value: "today", label: "Today", icon: "Sun" }, { value: "yesterday", label: "Yesterday", icon: "History" }, { value: "7d", label: "7 days", icon: "CalendarRange" }, { value: "month", label: "Month", icon: "CalendarDays" }, { value: "custom", label: "Custom", icon: "SlidersHorizontal" }]} /></Field>
        {rk === "custom" ? <div className="grid grid-cols-2 gap-2"><Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field></div> : <div className="flex items-end text-sm text-charcoal-500">{fmtShort(range.from)} → {fmtShort(range.to)}</div>}</div>
        <p className="mt-2 text-xs text-charcoal-500">{rep.description}{rk === "custom" && from > to ? " ⚠ 'From' is after 'To' — showing today." : ""}</p></Card>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">{res.kpis.slice(0, 4).map((k) => <Kpi key={k.label} label={k.label} value={k.value} />)}</div>
      {res.chart && <Card className="mb-5"><CardHeader title={rep.title} sub="Chart responds to the selected period" /><div className="p-4"><Chart type={res.chart.type} data={res.chart.data} xKey={res.chart.xKey} series={res.chart.series} money={/revenue|sales|fees|amt|rev|cash|variance/i.test(res.chart.series[0].key + res.chart.series[0].label)} height={280} /></div></Card>}
      <Card><CardHeader title="Detail" sub={`${res.rows.length} row(s)`} action={<Button variant="outline" size="sm" onClick={() => download(`${rep.id}_${range.from}_${range.to}.csv`, toCSV(res.columns, res.rows))} disabled={!res.rows.length}><Download className="h-4 w-4" />Export CSV</Button>} />
        <DataTable dense maxRows={30} rows={res.rows.map((r, i) => ({ r, i }))} rowKey={(x) => String(x.i)} empty={<Empty icon="FileSearch" title="No data for this period" text="Try a wider date range." />} columns={res.columns.map((c, ci) => ({ key: String(ci), header: c, align: typeof res.rows[0]?.[ci] === "number" ? ("right" as const) : undefined, render: (x: { r: (string | number)[] }) => { const v = x.r[ci]; return typeof v === "number" ? (/₱|fee|revenue|gross|net|cash|amount|total|payable|billed|variance|float|discount|refund|collected|expected|counted|cost|charges|current|\d\d.\d\d|90\+|tips/i.test(c) ? v.toLocaleString("en-PH", { maximumFractionDigits: 2 }) : v) : <span className="block max-w-md truncate">{v}</span>; } }))} />
        {res.notes && <p className="border-t p-3 text-xs text-charcoal-500">{res.notes}</p>}</Card>
    </>
  );
}
