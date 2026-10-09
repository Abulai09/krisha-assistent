import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getEnv } from "@/config/env";
import { validateRawListing } from "@/domain/listing/rawListingSchema";
import { detectFormat, parseImportFile } from "@/server/sources/importFile";
import { InvalidImportFileError } from "@/server/sources/types";
import { enqueueFileImport } from "./runQueueService";

export const INBOX_DIR = path.resolve(process.cwd(), "data", "inbox");

export interface UploadSummary {
  runId: string;
  total: number;
  valid: number;
  invalid: number;
  sampleErrors: string[];
}

/**
 * Проверяет загруженный файл и ставит импорт в очередь worker'а.
 * Имя файла на диске генерируется сервером — пользовательское имя используется только для определения формата.
 */
export async function acceptImportUpload(file: File): Promise<UploadSummary> {
  const env = getEnv();
  const maxBytes = env.IMPORT_MAX_FILE_MB * 1024 * 1024;
  if (file.size === 0) throw new InvalidImportFileError("Файл пустой");
  if (file.size > maxBytes) throw new InvalidImportFileError(`Файл больше ${env.IMPORT_MAX_FILE_MB} МБ`);

  const format = detectFormat(file.name);
  const content = decodeUtf8(new Uint8Array(await file.arrayBuffer()));
  const rows = parseImportFile(content, format, { maxBytes, maxRows: env.IMPORT_MAX_ROWS });

  let valid = 0;
  const sampleErrors: string[] = [];
  for (const row of rows) {
    const result = validateRawListing(row);
    if (result.ok) valid++;
    else if (sampleErrors.length < 5) {
      sampleErrors.push(`${result.error.externalId ?? "без id"}: ${result.error.issues.join("; ")}`);
    }
  }
  if (valid === 0) {
    throw new InvalidImportFileError(`Ни одно объявление не прошло проверку. Примеры ошибок: ${sampleErrors.join(" | ")}`);
  }

  await mkdir(INBOX_DIR, { recursive: true });
  const target = path.join(INBOX_DIR, `${randomUUID()}.json`);
  await writeFile(target, JSON.stringify(rows), { encoding: "utf8", flag: "wx" });
  try {
    const run = await enqueueFileImport(target);
    return { runId: run.id, total: rows.length, valid, invalid: rows.length - valid, sampleErrors };
  } catch (error) {
    await rm(target, { force: true });
    throw error;
  }
}

/** Только текст в UTF-8: бинарные файлы (архивы, исполняемые, изображения) отклоняются по содержимому. */
function decodeUtf8(bytes: Uint8Array): string {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.includes("\u0000")) throw new Error("binary");
    return text;
  } catch {
    throw new InvalidImportFileError("Файл должен быть текстовым CSV или JSON в кодировке UTF-8");
  }
}
