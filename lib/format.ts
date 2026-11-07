export const peso = (n: number, dec = 0) =>
  (n < 0 ? "-" : "") + "₱" + Math.abs(n).toLocaleString("en-PH", { minimumFractionDigits: dec, maximumFractionDigits: dec });
export const num = (n: number) => n.toLocaleString("en-PH");
export const pct = (n: number, dec = 0) => `${(n * 100).toFixed(dec)}%`;
export const r2 = (n: number) => Math.round(n * 100) / 100;
export const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
export const cap = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function toCSV(columns: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [columns.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}
