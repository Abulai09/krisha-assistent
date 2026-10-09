export interface DuplicateCandidate {
  id: string;
  fingerprint: string;
  firstSeenAt: Date;
  /** Синтетические и реальные объявления никогда не считаются дубликатами друг друга. */
  isSynthetic: boolean;
}

/**
 * Для каждой группы объявлений с одинаковым отпечатком оригиналом считается
 * самое раннее (при равенстве — с меньшим id), остальные — его дубликатами.
 * Возвращает id → id оригинала (или null, если объявление не дубликат).
 */
export function assignDuplicates(listings: DuplicateCandidate[]): Map<string, string | null> {
  const result = new Map<string, string | null>();
  const groups = new Map<string, DuplicateCandidate[]>();

  for (const listing of listings) {
    result.set(listing.id, null);
    if (listing.fingerprint.startsWith("uniq:")) continue;
    const groupKey = `${listing.isSynthetic ? "syn" : "real"}|${listing.fingerprint}`;
    const group = groups.get(groupKey) ?? [];
    group.push(listing);
    groups.set(groupKey, group);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [original, ...copies] = [...group].sort(
      (a, b) => a.firstSeenAt.getTime() - b.firstSeenAt.getTime() || a.id.localeCompare(b.id),
    );
    for (const copy of copies) result.set(copy.id, original.id);
  }

  return result;
}
