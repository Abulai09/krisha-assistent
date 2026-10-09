import type { NormalizedListing } from "@/domain/listing/normalize";
import { db } from "@/lib/db";

export type IngestOutcome = "created" | "updated" | "unchanged";

/**
 * Идемпотентно сохраняет объявление: ключ — (источник, externalId).
 * Повторное поступление того же объявления не создаёт дубликат; изменение цены пишется в историю.
 */
export async function ingestListing(
  sourceId: string,
  listing: NormalizedListing,
  runId: string | null,
  now: Date,
): Promise<IngestOutcome> {
  return db.$transaction(async (tx) => {
    const existing = await tx.listing.findUnique({
      where: { sourceId_externalId: { sourceId, externalId: listing.externalId } },
      select: { id: true, contentHash: true, status: true, priceKzt: true },
    });

    if (!existing) {
      await tx.listing.create({
        data: {
          ...listing,
          sourceId,
          status: "ACTIVE",
          firstSeenAt: now,
          lastSeenAt: now,
          priceHistory: { create: { priceKzt: listing.priceKzt, observedAt: now, collectionRunId: runId } },
        },
      });
      return "created";
    }

    if (existing.contentHash === listing.contentHash && existing.status === "ACTIVE") {
      await tx.listing.update({ where: { id: existing.id }, data: { lastSeenAt: now } });
      return "unchanged";
    }

    await tx.listing.update({
      where: { id: existing.id },
      data: { ...listing, status: "ACTIVE", lastSeenAt: now, deactivatedAt: null },
    });
    if (existing.priceKzt !== listing.priceKzt) {
      await tx.listingPriceHistory.create({
        data: { listingId: existing.id, priceKzt: listing.priceKzt, observedAt: now, collectionRunId: runId },
      });
    }
    return "updated";
  });
}

/**
 * Для источников с полным срезом: объявления, которых не было в ответе, считаются снятыми.
 * Для частичных источников (файлы) ничего не деактивируется.
 */
export async function deactivateMissingListings(sourceId: string, seenBefore: Date, now: Date): Promise<number> {
  const result = await db.listing.updateMany({
    where: { sourceId, status: "ACTIVE", lastSeenAt: { lt: seenBefore } },
    data: { status: "INACTIVE", deactivatedAt: now },
  });
  return result.count;
}
