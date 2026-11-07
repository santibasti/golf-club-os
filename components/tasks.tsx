"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { Badge, Button, Card, CardHeader, Icon, cn } from "./ui";
import { runTask, tasksForRole, type Task, type TaskLevel } from "@/lib/services/tasks";
import { fmt12 } from "@/lib/time";
import { ROLES } from "@/lib/permissions";

const LEVEL: Record<TaskLevel, { label: string; chip: string; dot: string }> = {
  now: { label: "Do now", chip: "bg-[#FBEAE7] text-[#9C3326]", dot: "bg-[#B4473A]" },
  soon: { label: "Coming up", chip: "bg-[#FFF3DC] text-[#8A5A00]", dot: "bg-[#D98E04]" },
  later: { label: "Later today", chip: "bg-charcoal-100 text-charcoal-600", dot: "bg-charcoal-300" },
};

function Row({ t }: { t: Task }) {
  const { act } = useStore(); const [busy, setBusy] = useState(false);
  const go = () => { if (!t.action) return; setBusy(true); act((d, c) => runTask(d, c, t.action!), (m) => m); setBusy(false); };
  return (
    <li className="flex items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0 sm:px-5">
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", LEVEL[t.level].chip)}><Icon name={t.icon} className="h-[18px] w-[18px]" /></span>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-charcoal">{t.title}</p>{t.detail && <p className="truncate text-xs text-charcoal-500">{t.detail}</p>}</div>
      {t.at && <span className="hidden shrink-0 text-xs font-semibold tabular-nums text-charcoal-500 sm:block">{fmt12(t.at)}</span>}
      {t.action && <Button size="sm" disabled={busy} onClick={go} className="shrink-0">{t.action.label}</Button>}
      <Link href={t.href} aria-label={`Open: ${t.title}`} className="shrink-0 rounded-lg p-1.5 text-charcoal-400 transition-colors hover:bg-charcoal-100 hover:text-forest"><ArrowRight className="h-4 w-4" /></Link>
    </li>
  );
}

/** "Today" task list for the current demo role. Derived live; one-click actions where the role may act. */
export function TaskList({ limit, title = "Today's tasks", className }: { limit?: number; title?: string; className?: string }) {
  const { db, session } = useStore(); const role = ROLES.find((r) => r.id === session.role)!; const [all, setAll] = useState(false);
  const tasks = useMemo(() => tasksForRole(db, session.role), [db, session.role]);
  const shown = limit && !all ? tasks.slice(0, limit) : tasks; const nowCount = tasks.filter((t) => t.level === "now").length;
  const groups = (["now", "soon", "later"] as TaskLevel[]).map((l) => ({ l, items: shown.filter((t) => t.level === l) })).filter((g) => g.items.length);
  return (
    <Card className={className}>
      <CardHeader title={<span className="flex items-center gap-2">{title}{nowCount > 0 && <Badge tone="red">{nowCount} to do now</Badge>}</span>} sub={`${role.label} · built from live data — finishing the work clears the task`} />
      {tasks.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-10 text-center"><span className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-7 w-7" /></span><p className="font-semibold text-forest">You&apos;re all caught up</p><p className="mt-1 max-w-xs text-sm text-charcoal-500">Nothing needs your attention right now. New tasks appear automatically as flights, payments and requests come in.</p></div>
      ) : (
        <>{groups.map((g) => <div key={g.l}><p className="flex items-center gap-2 bg-ivory-100/60 px-5 py-1.5 text-[10.5px] font-semibold uppercase tracking-[.14em] text-charcoal-500"><i className={cn("h-1.5 w-1.5 rounded-full", LEVEL[g.l].dot)} />{LEVEL[g.l].label} · {g.items.length}</p><ul>{g.items.map((t) => <Row key={t.id} t={t} />)}</ul></div>)}
          {limit && tasks.length > limit && <div className="border-t border-line p-2 text-center"><Button variant="ghost" size="sm" onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${tasks.length} tasks`}</Button></div>}</>
      )}
    </Card>
  );
}
export function useNowTaskCount() { const { db, session } = useStore(); return useMemo(() => tasksForRole(db, session.role).filter((t) => t.level === "now").length, [db, session.role]); }
