// Форматирование чисел для русскоязычного интерфейса. Используется и в объяснениях оценки, и в UI.

const integerFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const percentFormat = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatKzt(value: bigint | number): string {
  return `${integerFormat.format(value)} ₸`;
}

/** 47 300 000 → «47,3 млн ₸». */
export function formatKztShort(value: bigint | number): string {
  const amount = Number(value);
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) return `${decimalFormat.format(amount / 1_000_000_000)} млрд ₸`;
  if (abs >= 1_000_000) return `${decimalFormat.format(Math.round(amount / 100_000) / 10)} млн ₸`;
  if (abs >= 1_000) return `${integerFormat.format(Math.round(amount / 1_000))} тыс. ₸`;
  return formatKzt(amount);
}

export function formatPercent(value: number): string {
  return `${percentFormat.format(value)}%`;
}

export function formatArea(value: number | string): string {
  return `${decimalFormat.format(Number(value))} м²`;
}

export function formatNumber(value: number): string {
  return integerFormat.format(value);
}

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Almaty" });
const dateTimeFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Almaty",
});

const shortDateFormat = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Almaty" });

/** 19.09.2026 — для мест, где длинная дата не помещается. */
export function formatShortDate(date: Date): string {
  return shortDateFormat.format(date);
}

/** Оценка, а не точная сумма: округление до 10 000 ₸, чтобы не создавать ложную точность. */
export function formatKztApprox(value: bigint | number): string {
  const rounded = Math.round(Number(value) / 10_000) * 10_000;
  return `≈ ${formatKzt(rounded)}`;
}

export function formatDate(date: Date): string {
  return dateFormat.format(date);
}

export function formatDateTime(date: Date): string {
  return dateTimeFormat.format(date);
}

export function pluralize(count: number, forms: [one: string, few: string, many: string]): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
