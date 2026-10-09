import { KrishaApiSource } from "./krishaApiSource";
import { SyntheticSource } from "./syntheticSource";
import type { ListingSource } from "./types";

/** Источники, которые может обновлять worker по расписанию. Файловый импорт создаётся на каждый файл. */
const SCHEDULABLE_SOURCES: ListingSource[] = [new SyntheticSource(), new KrishaApiSource()];

export function getSchedulableSource(key: string): ListingSource | null {
  return SCHEDULABLE_SOURCES.find((source) => source.key === key) ?? null;
}

export function listSchedulableSources(): ListingSource[] {
  return SCHEDULABLE_SOURCES;
}
