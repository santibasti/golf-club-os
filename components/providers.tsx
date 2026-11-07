"use client";
import { StoreProvider, useStore } from "@/lib/store";
import { DisplayProvider } from "@/lib/display";
import { X, CheckCircle2, AlertTriangle, Info } from "lucide-react";

function ToastHost() {
  const { toasts, dismissToast } = useStore();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[5.5rem] z-[80] flex flex-col items-center gap-2 px-3">
      {toasts.map((t) => (
        <div key={t.id} role={t.kind === "error" ? "alert" : "status"} className={`pointer-events-auto flex w-full max-w-md animate-toast items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm shadow-lift backdrop-blur ${t.kind === "error" ? "border-[#F3CFC8] bg-[#FDF3F1]/95 text-[#8C3025]" : t.kind === "success" ? "border-emerald-100 bg-white/95 text-forest" : "border-line bg-white/95 text-charcoal"}`}>
          {t.kind === "error" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : t.kind === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="flex-1 leading-snug">{t.text}</span>
          <button aria-label="Dismiss" onClick={() => dismissToast(t.id)} className="rounded p-0.5 opacity-50 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}
export function Providers({ children }: { children: React.ReactNode }) {
  return <DisplayProvider><StoreProvider>{children}<ToastHost /></StoreProvider></DisplayProvider>;
}
