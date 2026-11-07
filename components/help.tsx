"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { CircleHelp, Lightbulb } from "lucide-react";
import { Button, Modal } from "./ui";
import { helpFor } from "@/lib/simple";

/** "?" button: plain-language steps for the page you are on. */
export function HelpButton() {
  const path = usePathname(); const [open, setOpen] = useState(false); const h = helpFor(path);
  return (<>
    <button onClick={() => setOpen(true)} aria-label="Help for this page" title="Help for this page" className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-white text-charcoal-600 shadow-sm transition-colors hover:bg-ivory-50"><CircleHelp className="h-[18px] w-[18px]" /></button>
    <Modal open={open} onClose={() => setOpen(false)} size="sm" title={h.title} footer={<Button onClick={() => setOpen(false)}>Got it</Button>}>
      <ol className="space-y-3">{h.steps.map((s, i) => <li key={i} className="flex gap-3 text-[15px] leading-snug"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-forest text-sm font-bold text-white">{i + 1}</span><span className="pt-0.5">{s}</span></li>)}</ol>
      {h.tip && <p className="mt-4 flex gap-2 rounded-xl bg-gold-50 p-3 text-sm text-gold-700"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />{h.tip}</p>}
    </Modal></>);
}
