"use client";
import { StoreProvider, useStore } from "@/lib/store";
import { X, CheckCircle2, AlertTriangle, Info } from "lucide-react";

function ToastHost() {
  const { toasts, dismissToast } = useStore();
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} role={t.kind === "error" ? "alert" : "status"} className={`pop pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-lg ${t.kind === "error" ? "border-[#F3CFC8] bg-[#FDF3F1] text-[#8C3025]" : t.kind === "success" ? "border-emerald-100 bg-white text-forest" : "border-charcoal-200 bg-white text-charcoal"}`}>
          {t.kind === "error" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : t.kind === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="flex-1">{t.text}</span>
          <button aria-label="Dismiss" onClick={() => dismissToast(t.id)}><X className="h-4 w-4 opacity-60" /></button>
        </div>
      ))}
    </div>
  );
}
export function Providers({ children }: { children: React.ReactNode }) {
  return <StoreProvider>{children}<ToastHost /></StoreProvider>;
}
