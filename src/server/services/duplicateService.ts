import { assignDuplicates } from "@/domain/listing/duplicates";
import { db } from "@/lib/db";
import { mapWithConcurrency } from "@/lib/utils/async";

/** Пересчитывает связи «дубликат → оригинал» среди активных объявлений. Возвращает число изменений. */
export async function refreshDuplicates(): Promise<number> {
  const listings = await db.listing.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, fingerprint: true, firstSeenAt: true, duplicateOfId: true, source: { select: { isSynthetic: true } } },
  });

  const assignments = assignDuplicates(
    listings.map((l) => ({ id: l.id, fingerprint: l.fingerprint, firstSeenAt: l.firstSeenAt, isSynthetic: l.source.isSynthetic })),
  );

  const changed = listings.filter((l) => (assignments.get(l.id) ?? null) !== l.duplicateOfId);
  await mapWithConcurrency(changed, 4, (listing) =>
    db.listing.update({ where: { id: listing.id }, data: { duplicateOfId: assignments.get(listing.id) ?? null } }),
  );

  // Неактивные объявления больше не участвуют в группах дубликатов.
  await db.listing.updateMany({ where: { status: "INACTIVE", duplicateOfId: { not: null } }, data: { duplicateOfId: null } });
  return changed.length;
}
