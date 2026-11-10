"use client";
/**
 * Demo data access layer. A single in-browser DB (localStorage) shared by every screen.
 * Stored in IndexedDB (structured clone; no 5 MB localStorage limit). ⚠ Browser persistence is NOT a production database or a secure multi-user backend.
 * To go to production, replace `commit`/`load` below with Supabase calls and run the same services server-side (see docs/PRODUCTION_READINESS.md).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { DB, Permission, RoleId } from "./types";
import { createSeedDB, SEED_VERSION } from "./seed";
import { Ctx, DomainError, audit } from "./services/core";
import { ROLES, can as canRole } from "./permissions";
import { fixFor } from "./simple";
import { addMinTs } from "./time";

const SESSION_KEY = "gcos.session.v1";
export interface Session { role: RoleId; portalCustomerId?: string }
export type ActResult<T> = { ok: true; value: T } | { ok: false; error: string };
export interface ToastAction { label: string; href: string }
interface Toast { id: number; kind: "success" | "error" | "info"; text: string; action?: ToastAction }

interface StoreCtx {
  db: DB; ready: boolean; session: Session; ctx: Ctx; persistError: string | null;
  act: <T>(fn: (db: DB, ctx: Ctx) => T, successMsg?: string | ((v: T) => string), ctxOverride?: Ctx, next?: ToastAction | ((v: T) => ToastAction | undefined)) => ActResult<T>;
  setRole: (r: RoleId) => void; setPortalCustomer: (id: string) => void;
  can: (perm: Permission) => boolean; resetDemo: () => void; advanceClock: (minutes: number) => void;
  toast: (text: string, kind?: Toast["kind"], action?: ToastAction) => void; toasts: Toast[]; dismissToast: (id: number) => void;
}
const Ctx_ = createContext<StoreCtx | null>(null);
export const useStore = () => { const c = useContext(Ctx_); if (!c) throw new Error("StoreProvider missing"); return c; };

/* IndexedDB: the demo database is several MB, which overflows localStorage's ~5 MB quota. */
const IDB_NAME = "gcos", IDB_STORE = "kv", IDB_KEY = "db";
function idbOpen(): Promise<IDBDatabase> { return new Promise((res, rej) => { const r = indexedDB.open(IDB_NAME, 1); r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbGet<T>(): Promise<T | undefined> { const db = await idbOpen(); return new Promise((res, rej) => { const q = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(IDB_KEY); q.onsuccess = () => { db.close(); res(q.result as T | undefined); }; q.onerror = () => { db.close(); rej(q.error); }; }); }
async function idbSet(v: unknown): Promise<void> { const db = await idbOpen(); return new Promise((res, rej) => { const t = db.transaction(IDB_STORE, "readwrite"); t.objectStore(IDB_STORE).put(v, IDB_KEY); t.oncomplete = () => { db.close(); res(); }; t.onerror = () => { db.close(); rej(t.error); }; t.onabort = () => { db.close(); rej(t.error); }; }); }
/** Old builds kept a full copy per data version in localStorage — remove them to free the quota. */
function purgeLegacy() { try { for (const k of Object.keys(localStorage)) if (k.startsWith("gcos.db.")) localStorage.removeItem(k); } catch { /* ignore */ } }
/** Never wait forever: some browsers (private windows, blocked storage) leave IndexedDB requests pending. */
const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("timeout")), ms); p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); }); });
async function loadDB(): Promise<DB> {
  try { const d = await withTimeout(idbGet<DB>(), 2500); if (d?.meta?.version === SEED_VERSION) { purgeLegacy(); return d; } } catch { /* IndexedDB unavailable or slow → start from the seed in memory */ }
  purgeLegacy(); return createSeedDB();
}
export async function clearSavedData() { try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } purgeLegacy(); try { const db = await withTimeout(idbOpen(), 1500); db.close(); await withTimeout(new Promise<void>((res) => { const r = indexedDB.deleteDatabase(IDB_NAME); r.onsuccess = r.onerror = r.onblocked = () => res(); }), 1500); } catch { /* ignore */ } }

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB | null>(null);
  const [session, setSession] = useState<Session>({ role: "gm" });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [persistError, setPersistError] = useState<string | null>(null);
  const dbRef = useRef<DB | null>(null); const timer = useRef<ReturnType<typeof setTimeout> | null>(null); const tid = useRef(1);

  useEffect(() => {
    let alive = true; loadDB().then((d) => { if (!alive) return; dbRef.current = d; setDb(d); idbSet(d).catch(() => undefined); }).catch(() => { if (!alive) return; const d = createSeedDB(); dbRef.current = d; setDb(d); });
    try { const s = localStorage.getItem(SESSION_KEY); if (s) setSession(JSON.parse(s)); } catch { /* ignore */ }
    return () => { alive = false; };
  }, []);

  const persist = useCallback((d: DB) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { idbSet(d).then(() => setPersistError(null)).catch(() => setPersistError("Browser storage is unavailable (private window or blocked) — changes will be lost on refresh.")); }, 400);
  }, []);

  const toast = useCallback((text: string, kind: Toast["kind"] = "info", action?: ToastAction) => {
    const id = tid.current++; setToasts((t) => [...t.slice(-2), { id, kind, text, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 8000 : action ? 7000 : 3200);
  }, []);

  const ctx: Ctx = useMemo(() => { const r = ROLES.find((x) => x.id === session.role)!; return { role: session.role, actor: r.user }; }, [session.role]);

  const act = useCallback(<T,>(fn: (db: DB, ctx: Ctx) => T, successMsg?: string | ((v: T) => string), ctxOverride?: Ctx, next?: ToastAction | ((v: T) => ToastAction | undefined)): ActResult<T> => {
    const cur = dbRef.current; if (!cur) return { ok: false, error: "Data not loaded yet." };
    const draft: DB = structuredClone(cur);
    try {
      const value = fn(draft, ctxOverride ?? ctx);
      dbRef.current = draft; setDb(draft); persist(draft);
      if (successMsg) toast(typeof successMsg === "function" ? successMsg(value) : successMsg, "success", typeof next === "function" ? next(value) : next);
      return { ok: true, value };
    } catch (e) {
      if (e instanceof DomainError) { toast(e.message, "error", fixFor(e.code)); return { ok: false, error: e.message }; }
      console.error(e); const m = "Unexpected error — nothing was saved. " + (e instanceof Error ? e.message : ""); toast(m, "error"); return { ok: false, error: m };
    }
  }, [ctx, persist, toast]);

  const setRole = useCallback((r: RoleId) => { setSession((s) => { const n = { ...s, role: r }; try { localStorage.setItem(SESSION_KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; }); }, []);
  const setPortalCustomer = useCallback((id: string) => { setSession((s) => { const n = { ...s, portalCustomerId: id }; try { localStorage.setItem(SESSION_KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; }); }, []);
  const resetDemo = useCallback(() => {
    const d = createSeedDB(); audit(d, { role: "system", actor: "System" }, "demo.reset", "system", "demo", "Demo data restored to the original seeded state");
    dbRef.current = d; setDb(d); idbSet(d).catch(() => setPersistError("Browser storage is unavailable — changes will be lost on refresh.")); toast("Demo data restored to its original state.", "success");
  }, [toast]);
  const advanceClock = useCallback((minutes: number) => { act((d, c) => { d.meta.now = addMinTs(d.meta.now, minutes); audit(d, c, "demo.clock", "system", "clock", `Demo clock advanced ${minutes} min → ${d.meta.now}`); }); }, [act]);
  const can = useCallback((perm: Permission) => !!db && canRole(db, session.role, perm), [db, session.role]);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const value = useMemo<StoreCtx | null>(() => db ? { db, ready: true, session, ctx, persistError, act, setRole, setPortalCustomer, can, resetDemo, advanceClock, toast, toasts, dismissToast } : null, [db, session, ctx, persistError, act, setRole, setPortalCustomer, can, resetDemo, advanceClock, toast, toasts, dismissToast]);
  if (!value) return <LoadingScreen />;
  return <Ctx_.Provider value={value}>{children}</Ctx_.Provider>;
}

function LoadingScreen() {
  const [slow, setSlow] = useState(false); useEffect(() => { const t = setTimeout(() => setSlow(true), 6000); return () => clearTimeout(t); }, []);
  return (
    <div className="grid min-h-screen place-items-center bg-ivory px-4 text-forest"><div className="text-center">
      <span className="mx-auto mb-5 grid h-14 w-14 animate-pulse place-items-center rounded-2xl bg-gradient-to-br from-forest-700 to-forest-900 text-gold-300 shadow-lift"><svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21V3l9 4-9 4" /><circle cx="8" cy="21" r="1.2" fill="currentColor" /></svg></span>
      <p className="font-display text-xl tracking-wide">GOLF CLUB OS</p><p className="mt-1 text-sm text-charcoal-500">Preparing demonstration data…</p>
      {slow && <div className="mx-auto mt-6 max-w-sm rounded-2xl border border-line bg-white p-4 text-left text-sm shadow-card"><p className="font-semibold text-forest">Taking longer than expected</p><p className="mt-1 text-charcoal-600">The app may not have started in this browser. Try reloading. If you opened it from another device in development mode, restart <code className="rounded bg-ivory-100 px-1">npm run dev</code> after updating, or use <code className="rounded bg-ivory-100 px-1">npm run build &amp;&amp; npm start</code>.</p>
        <div className="mt-3 flex gap-2"><button className="h-10 flex-1 rounded-lg bg-forest text-sm font-medium text-white" onClick={() => location.reload()}>Reload</button><button className="h-10 flex-1 rounded-lg border border-charcoal-200 bg-white text-sm font-medium" onClick={async () => { await clearSavedData(); location.reload(); }}>Clear saved data & retry</button></div></div>}
    </div></div>
  );
}
