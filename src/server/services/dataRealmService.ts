import { db } from "@/lib/db";

/**
 * Какой набор данных показывать: реальные данные всегда важнее синтетических.
 * Синтетика и реальные объявления никогда не смешиваются в статистике и оценках.
 */
export type DataRealm = "real" | "synthetic" | "empty";

export async function getActiveRealm(): Promise<DataRealm> {
  const [real, synthetic] = await Promise.all([
    db.listing.count({ where: { status: "ACTIVE", source: { isSynthetic: false } }, take: 1 }),
    db.listing.count({ where: { status: "ACTIVE", source: { isSynthetic: true } }, take: 1 }),
  ]);
  if (real > 0) return "real";
  if (synthetic > 0) return "synthetic";
  return "empty";
}

export const realmIsSynthetic = (realm: DataRealm) => realm === "synthetic";
