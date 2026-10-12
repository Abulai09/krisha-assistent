// Насколько заполнена база относительно лимита тарифа. Supabase при превышении лимита переводит базу
// в режим «только чтение» — новые объявления перестают сохраняться, поэтому предупреждаем заранее.

export type StorageLevel = "ok" | "warning" | "critical";

const WARNING_SHARE = 0.7;
const CRITICAL_SHARE = 0.9;

export interface StorageUsage {
  /** Доля лимита в процентах, округлённая; может быть больше 100. */
  percent: number;
  level: StorageLevel;
}

export function storageUsage(usedBytes: number, limitBytes: number): StorageUsage {
  const share = limitBytes > 0 ? usedBytes / limitBytes : 1;
  const level: StorageLevel = share >= CRITICAL_SHARE ? "critical" : share >= WARNING_SHARE ? "warning" : "ok";
  return { percent: Math.round(share * 100), level };
}
