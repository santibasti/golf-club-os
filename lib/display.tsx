"use client";
/** Display preferences: touch mode, text size, outdoor high-contrast. Stored per device in localStorage; applied as <html> data attributes (see globals.css). */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type TouchPref = "auto" | "on" | "off"; export type SizePref = "normal" | "large" | "xl";
export interface Display { touch: TouchPref; size: SizePref; contrast: boolean; simple: boolean }
const KEY = "gcos.display.v1"; const DEFAULT: Display = { touch: "auto", size: "normal", contrast: false, simple: true };
interface Ctx { display: Display; set: (p: Partial<Display>) => void; touchActive: boolean }
const C = createContext<Ctx>({ display: DEFAULT, set: () => undefined, touchActive: false });
export const useDisplay = () => useContext(C);

const isCoarse = () => typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || (navigator.maxTouchPoints ?? 0) > 1) && window.innerWidth <= 1600;

export function DisplayProvider({ children }: { children: React.ReactNode }) {
  const [display, setDisplay] = useState<Display>(DEFAULT); const [coarse, setCoarse] = useState(false);
  useEffect(() => { try { const s = localStorage.getItem(KEY); if (s) setDisplay({ ...DEFAULT, ...JSON.parse(s) }); } catch { /* ignore */ } setCoarse(isCoarse()); }, []);
  const touchActive = display.touch === "on" || (display.touch === "auto" && coarse);
  useEffect(() => { const h = document.documentElement; h.dataset.touch = touchActive ? "1" : "0"; h.dataset.size = display.size; h.dataset.contrast = display.contrast ? "1" : "0"; }, [display, touchActive]);
  const set = (p: Partial<Display>) => setDisplay((d) => { const n = { ...d, ...p }; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const value = useMemo(() => ({ display, set, touchActive }), [display, touchActive]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
