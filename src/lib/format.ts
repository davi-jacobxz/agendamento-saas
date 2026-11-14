export const TZ = "Europe/Lisbon";

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-PT", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

/** Diferença (em minutos) entre Lisboa e UTC num instante. 0 no inverno, 60 no verão. */
export function lisbonOffsetMinutes(utcMs: number): number {
  const base = Math.floor(utcMs / 1000) * 1000;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(base));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return Math.round((asUtc - base) / 60000);
}

/** Data de Lisboa ("2026-07-15") + hora ("HH:MM[:SS]") → instante ISO (UTC). Trata verão/inverno. */
export function lisbonToIso(dateStr: string, time = "00:00:00"): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm, ss] = time.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm, ss || 0);
  let utc = naive - lisbonOffsetMinutes(naive) * 60000;
  utc = naive - lisbonOffsetMinutes(utc) * 60000;
  return new Date(utc).toISOString();
}

/** "2026-07-15" → instante (ISO, UTC) correspondente a 23:59:59 em Lisboa nesse dia. */
export function endOfDayLisbon(dateStr: string): string {
  return lisbonToIso(dateStr, "23:59:59");
}

/** "2026-07-15" → instante (ISO, UTC) da meia-noite em Lisboa nesse dia. */
export function startOfDayLisbon(dateStr: string): string {
  return lisbonToIso(dateStr, "00:00:00");
}

/** Instante ISO → "yyyy-mm-dd" no calendário de Lisboa (para o campo de data). */
export function lisbonDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function todayLisbon(): string {
  return lisbonDateInput(new Date().toISOString());
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function slugify(texto: string): string {
  return texto
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** 0 = domingo … 6 = sábado (igual ao banco). */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Segunda-feira da semana que contém a data. */
export function mondayOf(dateStr: string): string {
  const w = weekdayOf(dateStr);
  return addDaysToDateStr(dateStr, w === 0 ? -6 : 1 - w);
}

export function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-PT", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

/** "2026-11-09" → "segunda-feira, 9 de novembro" */
export function fmtDayLong(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-PT", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** Instante ISO → "HH:MM" em Lisboa (para campos de hora). */
export function lisbonTimeInput(iso: string): string {
  return fmtTime(iso);
}

export function fmtEuros(cents: number): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(cents / 100);
}

/** "12,50" ou "12.5" → 1250 (cêntimos); null se inválido. */
export function parseEuros(texto: string): number | null {
  const t = texto.trim().replace(",", ".");
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(parseFloat(t) * 100);
}

export function eurosInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Igual a app_private.normalize_phone do banco. */
export function normalizePhone(p: string): string | null {
  let v = p.replace(/[\s\-.()]/g, "");
  if (v.startsWith("00")) v = "+" + v.slice(2);
  if (/^[29]\d{8}$/.test(v)) return "+351" + v;
  if (/^\+351[29]\d{8}$/.test(v)) return v;
  if (/^\+(?!351)[1-9]\d{7,14}$/.test(v)) return v;
  return null;
}

/** Contraste WCAG entre a cor (#rrggbb) e branco. ≥ 4,5 é o recomendado para texto. */
export function contrastWithWhite(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return 1.05 / (L + 0.05);
}

/** 45 → "45 min"; 120 → "2 h"; 150 → "2 h 30 min". */
export function fmtDuracao(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
