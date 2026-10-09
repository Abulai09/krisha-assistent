import { readFile } from "node:fs/promises";
import { getEnv } from "@/config/env";
import { detectFormat, parseImportFile } from "./importFile";
import type { ListingSource, SourceStatus } from "./types";

export const FILE_IMPORT_SOURCE = {
  key: "file-import",
  name: "Импорт CSV/JSON",
  kind: "FILE_IMPORT",
  isSynthetic: false,
  // Файл может содержать только часть объявлений — отсутствие в файле не означает снятие с продажи.
  providesFullSnapshot: false,
} as const;

/**
 * Источник «файл импорта». Загружайте только данные, на использование которых у вас есть права
 * (собственная выгрузка, данные партнёра по договору и т. п.).
 */
export class FileImportSource implements ListingSource {
  readonly key = FILE_IMPORT_SOURCE.key;
  readonly name = FILE_IMPORT_SOURCE.name;
  readonly kind = FILE_IMPORT_SOURCE.kind;
  readonly isSynthetic = FILE_IMPORT_SOURCE.isSynthetic;
  readonly providesFullSnapshot = FILE_IMPORT_SOURCE.providesFullSnapshot;

  constructor(private readonly filePath: string) {}

  async checkStatus(): Promise<SourceStatus> {
    return { availability: "CONNECTED", message: "Импорт файлов CSV/JSON доступен" };
  }

  async fetchListings(): Promise<unknown[]> {
    const env = getEnv();
    const content = await readFile(this.filePath, "utf8");
    return parseImportFile(content, detectFormat(this.filePath), {
      maxBytes: env.IMPORT_MAX_FILE_MB * 1024 * 1024,
      maxRows: env.IMPORT_MAX_ROWS,
    });
  }
}
