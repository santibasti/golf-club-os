"use client";
import React from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_SEQ } from "./ui";

const axis = { fontSize: 11, fill: "#656B69" };
const tip = { contentStyle: { borderRadius: 10, border: "1px solid #ECEDEC", boxShadow: "0 8px 24px rgba(15,61,46,.12)", fontSize: 12 } };
export type Series = { key: string; label: string };
const fmtVal = (v: unknown, money?: boolean) => (typeof v === "number" ? (money ? "₱" + Math.round(v).toLocaleString("en-PH") : v.toLocaleString("en-PH")) : String(v));
const shortNum = (v: number, money?: boolean) => (money ? "₱" : "") + (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + "M" : Math.abs(v) >= 1e3 ? Math.round(v / 1e3) + "k" : v);

export function Chart({ type, data, xKey, series, height = 260, money, stacked, percent }: { type: "bar" | "line" | "area" | "pie"; data: Record<string, string | number>[]; xKey: string; series: Series[]; height?: number; money?: boolean; stacked?: boolean; percent?: boolean }) {
  if (!data.length) return <div className="grid place-items-center text-sm text-charcoal-400" style={{ height }}>No data for this period</div>;
  const label = (k: string) => series.find((s) => s.key === k)?.label ?? k;
  if (type === "pie") {
    const total = data.reduce((a, d) => a + Number(d[series[0].key] || 0), 0);
    return (
      <div style={{ height }} className="flex flex-col items-center gap-2 sm:flex-row"><div className="h-full min-h-[160px] w-full sm:w-1/2"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey={series[0].key} nameKey={xKey} innerRadius="55%" outerRadius="90%" paddingAngle={2} stroke="#fff">{data.map((_, i) => <Cell key={i} fill={CHART_SEQ[i % CHART_SEQ.length]} />)}</Pie><Tooltip {...tip} formatter={(v) => fmtVal(v, money)} /></PieChart></ResponsiveContainer></div>
        <ul className="w-full space-y-1.5 text-xs sm:w-1/2">{data.map((d, i) => <li key={i} className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CHART_SEQ[i % CHART_SEQ.length] }} /><span className="flex-1 truncate">{String(d[xKey])}</span><span className="font-medium tabular-nums">{fmtVal(d[series[0].key], money)}</span><span className="w-9 text-right text-charcoal-400">{total ? Math.round((Number(d[series[0].key]) / total) * 100) : 0}%</span></li>)}</ul></div>
    );
  }
  const common = { data, margin: { top: 8, right: 8, left: -8, bottom: 0 } };
  const grid = <CartesianGrid stroke="#ECEDEC" strokeDasharray="3 3" vertical={false} />;
  const xa = <XAxis dataKey={xKey} tick={axis} tickLine={false} axisLine={{ stroke: "#DADCDA" }} interval="preserveStartEnd" />;
  const ya = <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={(v) => (percent ? v + "%" : shortNum(v, money))} width={46} />;
  const tt = <Tooltip {...tip} formatter={(v, n) => [fmtVal(v, money) + (percent ? "%" : ""), label(String(n))]} />;
  const lg = series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => label(String(v))} /> : null;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {type === "bar" ? (
          <BarChart {...common}>{grid}{xa}{ya}{tt}{lg}{series.map((s, i) => <Bar key={s.key} dataKey={s.key} stackId={stacked ? "a" : undefined} fill={CHART_SEQ[i % CHART_SEQ.length]} radius={stacked ? 0 : [4, 4, 0, 0]} maxBarSize={36} />)}</BarChart>
        ) : type === "area" ? (
          <AreaChart {...common}>{grid}{xa}{ya}{tt}{lg}{series.map((s, i) => <Area key={s.key} type="monotone" dataKey={s.key} stroke={CHART_SEQ[i % CHART_SEQ.length]} fill={CHART_SEQ[i % CHART_SEQ.length]} fillOpacity={0.12} strokeWidth={2} />)}</AreaChart>
        ) : (
          <LineChart {...common}>{grid}{xa}{ya}{tt}{lg}{series.map((s, i) => <Line key={s.key} type="monotone" dataKey={s.key} stroke={CHART_SEQ[i % CHART_SEQ.length]} strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} />)}</LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
