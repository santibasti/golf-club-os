// Club-local date/time helpers. No timezone conversion is performed anywhere: the DB stores club-local (Asia/Manila) strings.
export const pad = (n: number) => String(n).padStart(2, "0");
export const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
export const fromMin = (m: number) => { const x = ((m % 1440) + 1440) % 1440; return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`; };

const utc = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return Date.UTC(y, m - 1, dd); };
export const addDays = (d: string, n: number) => { const t = new Date(utc(d) + n * 86400000); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
export const diffDays = (a: string, b: string) => Math.round((utc(a) - utc(b)) / 86400000);
export const dow = (d: string) => new Date(utc(d)).getUTCDay();
export const isWeekend = (d: string) => [0, 6].includes(dow(d));
export const dateRange = (from: string, to: string) => { const out: string[] = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
export const monthStart = (d: string) => d.slice(0, 8) + "01";
export const addMonths = (d: string, n: number) => { const [y, m, dd] = d.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1 + n, 1)); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(Math.min(dd, last))}`; };

export const dateOf = (ts: string) => ts.slice(0, 10);
export const timeOf = (ts: string) => ts.slice(11, 16);
export const mkTs = (date: string, time: string) => `${date}T${time}`;
export const tsMin = (ts: string) => Math.floor(utc(dateOf(ts)) / 60000) + toMin(timeOf(ts));
export const addMinTs = (ts: string, mins: number) => {
  const total = toMin(timeOf(ts)) + mins; const dayShift = Math.floor(total / 1440);
  return mkTs(addDays(dateOf(ts), dayShift), fromMin(total));
};
export const minsBetween = (a: string, b: string) => tsMin(b) - tsMin(a);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const fmtDate = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return `${DAYS[dow(d)]}, ${MONTHS[m - 1]} ${dd}, ${y}`; };
export const fmtShort = (d: string) => { const [, m, dd] = d.split("-").map(Number); return `${MONTHS[m - 1]} ${dd}`; };
export const fmtMonth = (d: string) => { const [y, m] = d.split("-").map(Number); return `${MONTHS[m - 1]} ${y}`; };
export const fmt12 = (t: string) => { const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h >= 12 ? "PM" : "AM"}`; };
export const fmtTs = (ts?: string) => (ts ? `${fmtShort(dateOf(ts))} ${fmt12(timeOf(ts))}` : "—");

export function manilaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
