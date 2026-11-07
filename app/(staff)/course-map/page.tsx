"use client";
import { useStore } from "@/lib/store";
import { Kpi, PageHeader } from "@/components/ui";
import { CourseMap } from "@/components/course-map";
import { allTracks } from "@/lib/services/tracking";
import { useMemo } from "react";

export default function CourseMapPage() {
  const { db } = useStore(); const t = useMemo(() => allTracks(db), [db]);
  const out = t.filter((x) => x.zone === "course"); const behind = out.filter((x) => x.paceStatus === "behind").length; const haz = t.filter((x) => x.hazard).length;
  return (
    <>
      <PageHeader icon="Map" title="Course Map & Carts" sub="Where every cart is, who has it, and how the course is flowing — GPS-ready (simulated in this demo)" />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Carts on course" value={out.length} icon="Route" /><Kpi label="Behind pace" value={behind} icon="TimerOff" tone={behind ? "red" : "neutral"} sub="flights" /><Kpi label="On restricted holes" value={haz} icon="OctagonAlert" tone={haz ? "red" : "neutral"} />
        <Kpi label="Parked at barn" value={t.filter((x) => x.zone === "barn").length} icon="Warehouse" /><Kpi label="In maintenance" value={t.filter((x) => x.zone === "shed").length} icon="Wrench" tone="gold" />
      </div>
      <CourseMap />
    </>
  );
}
