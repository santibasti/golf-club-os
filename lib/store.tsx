"use client";
/**
 * Demo data access layer. A single in-browser DB (localStorage) shared by every screen.
 * ⚠ Browser persistence is NOT a production database or a secure multi-user backend.
 * To go to production, replace `commit`/`load` below with Supabase calls and run the same services server-side (see docs/PRODUCTION_READINESS.md).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { DB, Permission, RoleId } from "./types";
import { createSeedDB, SEED_VERSION } from "./seed";
import { Ctx, DomainError, audit } from "./services/core";
import { ROLES, can as canRole } from "./permissions";
import { addMinTs } from "./time";

const DB_KEY = "gcos.db.v" + SEED_VERSION;
const SESSION_KEY = "gcos.session.v1";
export interface Session { role: RoleId; portalCustomerId?: string }
export type ActResult<T> = { ok: true; value: T } | { ok: false; error: string };
interface Toast { id: number; kind: "success" | "error" | "info"; text: string }

interface StoreCtx {
  db: DB; ready: boolean; session: Session; ctx: Ctx; persistError: string | null;
  act: <T>(fn: (db: DB, ctx: Ctx) => T, successMsg?: string | ((v: T) => string), ctxOverride?: Ctx) => ActResult<T>;
  setRole: (r: RoleId) => void; setPortalCustomer: (id: string) => void;
  can: (perm: Permission) => boolean; resetDemo: () => void; advanceClock: (minutes: number) => void;
  toast: (text: string, kind?: Toast["kind"]) => void; toasts: Toast[]; dismissToast: (id: number) => void;
}
const Ctx_ = createContext<StoreCtx | null>(null);
export const useStore = () => { const c = useContext(Ctx_); if (!c) throw new Error("StoreProvider missing"); return c; };

function loadDB(): DB {
  try { const raw = localStorage.getItem(DB_KEY); if (raw) { const d = JSON.parse(raw) as DB; if (d?.meta?.version === SEED_VERSION) return d; } } catch { /* fall through to reseed */ }
  return createSeedDB();
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB | null>(null);
  const [session, setSession] = useState<Session>({ role: "gm" });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [persistError, setPersistError] = useState<string | null>(null);
  const dbRef = useRef<DB | null>(null); const timer = useRef<ReturnType<typeof setTimeout> | null>(null); const tid = useRef(1);

  useEffect(() => {
    const d = loadDB(); dbRef.current = d; setDb(d);
    try { const s = localStorage.getItem(SESSION_KEY); if (s) setSession(JSON.parse(s)); } catch { /* ignore */ }
  }, []);

  const persist = useCallback((d: DB) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try { localStorage.setItem(DB_KEY, JSON.stringify(d)); setPersistError(null); }
      catch { try { const slim = { ...d, audit: d.audit.slice(-800), messages: d.messages.slice(-100) }; localStorage.setItem(DB_KEY, JSON.stringify(slim)); setPersistError("Browser storage nearly full — older audit entries were trimmed."); } catch { setPersistError("Browser storage is full — changes will be lost on refresh. Use Reset Demo Data."); } }
    }, 250);
  }, []);

  const toast = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const id = tid.current++; setToasts((t) => [...t.slice(-2), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 6500 : 3200);
  }, []);

  const ctx: Ctx = useMemo(() => { const r = ROLES.find((x) => x.id === session.role)!; return { role: session.role, actor: r.user }; }, [session.role]);

  const act = useCallback(<T,>(fn: (db: DB, ctx: Ctx) => T, successMsg?: string | ((v: T) => string), ctxOverride?: Ctx): ActResult<T> => {
    const cur = dbRef.current; if (!cur) return { ok: false, error: "Data not loaded yet." };
    const draft: DB = structuredClone(cur);
    try {
      const value = fn(draft, ctxOverride ?? ctx);
      dbRef.current = draft; setDb(draft); persist(draft);
      if (successMsg) toast(typeof successMsg === "function" ? successMsg(value) : successMsg, "success");
      return { ok: true, value };
    } catch (e) {
      if (e instanceof DomainError) { toast(e.message, "error"); return { ok: false, error: e.message }; }
      console.error(e); const m = "Unexpected error — nothing was saved. " + (e instanceof Error ? e.message : ""); toast(m, "error"); return { ok: false, error: m };
    }
  }, [ctx, persist, toast]);

  const setRole = useCallback((r: RoleId) => { setSession((s) => { const n = { ...s, role: r }; try { localStorage.setItem(SESSION_KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; }); }, []);
  const setPortalCustomer = useCallback((id: string) => { setSession((s) => { const n = { ...s, portalCustomerId: id }; try { localStorage.setItem(SESSION_KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; }); }, []);
  const resetDemo = useCallback(() => {
    const d = createSeedDB(); audit(d, { role: "system", actor: "System" }, "demo.reset", "system", "demo", "Demo data restored to the original seeded state");
    dbRef.current = d; setDb(d); try { localStorage.setItem(DB_KEY, JSON.stringify(d)); } catch { /* ignore */ } toast("Demo data restored to its original state.", "success");
  }, [toast]);
  const advanceClock = useCallback((minutes: number) => { act((d, c) => { d.meta.now = addMinTs(d.meta.now, minutes); audit(d, c, "demo.clock", "system", "clock", `Demo clock advanced ${minutes} min → ${d.meta.now}`); }); }, [act]);
  const can = useCallback((perm: Permission) => !!db && canRole(db, session.role, perm), [db, session.role]);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const value = useMemo<StoreCtx | null>(() => db ? { db, ready: true, session, ctx, persistError, act, setRole, setPortalCustomer, can, resetDemo, advanceClock, toast, toasts, dismissToast } : null, [db, session, ctx, persistError, act, setRole, setPortalCustomer, can, resetDemo, advanceClock, toast, toasts, dismissToast]);
  if (!value) return <div className="grid min-h-screen place-items-center bg-ivory text-forest"><div className="text-center"><span className="mx-auto mb-5 grid h-14 w-14 animate-pulse place-items-center rounded-2xl bg-gradient-to-br from-forest-700 to-forest-900 text-gold-300 shadow-lift"><svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21V3l9 4-9 4" /><circle cx="8" cy="21" r="1.2" fill="currentColor" /></svg></span><p className="font-display text-xl tracking-wide">GOLF CLUB OS</p><p className="mt-1 text-sm text-charcoal-500">Preparing demonstration data…</p></div></div>;
  return <Ctx_.Provider value={value}>{children}</Ctx_.Provider>;
}
