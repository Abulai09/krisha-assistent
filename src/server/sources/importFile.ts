import { InvalidImportFileError } from "./types";

// Разбор CSV/JSON-файлов импорта. Данные только читаются как текст:
// никакого eval, динамических импортов или выполнения формул.

export type ImportFormat = "csv" | "json";

export interface ImportLimits {
  maxBytes: number;
  maxRows: number;
}

export function detectFormat(fileName: string): ImportFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".json")) return "json";
  throw new InvalidImportFileError("Поддерживаются только файлы .csv и .json");
}

export function parseImportFile(content: string, format: ImportFormat, limits: ImportLimits): Record<string, unknown>[] {
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > limits.maxBytes) {
    throw new InvalidImportFileError(
      `Файл слишком большой: ${(bytes / 1024 / 1024).toFixed(1)} МБ, допустимо ${(limits.maxBytes / 1024 / 1024).toFixed(1)} МБ`,
    );
  }

  const text = content.replace(/^﻿/, "");
  const rows = format === "json" ? parseJson(text) : parseCsv(text);
  if (rows.length === 0) throw new InvalidImportFileError("В файле нет объявлений");
  if (rows.length > limits.maxRows) {
    throw new InvalidImportFileError(`Слишком много строк: ${rows.length}, допустимо ${limits.maxRows}`);
  }
  return rows;
}

function parseJson(text: string): Record<string, unknown>[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new InvalidImportFileError("Некорректный JSON");
  }
  const items = Array.isArray(data)
    ? data
    : data && typeof data === "object" && "listings" in data && Array.isArray(data.listings)
      ? data.listings
      : null;
  if (!items) throw new InvalidImportFileError("JSON должен быть массивом объявлений или объектом { \"listings\": [...] }");
  return items.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new InvalidImportFileError(`Элемент ${index + 1} не является объектом`);
    }
    return toPlainRecord(item as Record<string, unknown>);
  });
}

/** Копирует только собственные поля, отбрасывая __proto__/constructor — защита от prototype pollution. */
function toPlainRecord(source: Record<string, unknown>): Record<string, unknown> {
  const record: Record<string, unknown> = Object.create(null);
  for (const [key, value] of Object.entries(source)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    record[key] = value;
  }
  return record;
}

/** CSV по RFC 4180: разделитель «,» или «;», кавычки, переносы строк внутри кавычек. */
export function parseCsv(text: string): Record<string, unknown>[] {
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? undefined : text.indexOf("\n"));
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const table = tokenizeCsv(text, delimiter);
  const nonEmpty = table.filter((row) => row.some((cell) => cell.trim() !== ""));
  if (nonEmpty.length === 0) return [];

  const [header, ...rows] = nonEmpty;
  const columns = header.map((name) => name.trim());
  if (columns.some((name) => name === "")) throw new InvalidImportFileError("В заголовке CSV есть пустые названия колонок");
  if (new Set(columns).size !== columns.length) throw new InvalidImportFileError("В заголовке CSV повторяются колонки");

  return rows.map((row, index) => {
    if (row.length > columns.length) {
      throw new InvalidImportFileError(`Строка ${index + 2}: больше значений, чем колонок`);
    }
    const record: Record<string, unknown> = Object.create(null);
    columns.forEach((column, i) => {
      if (column === "__proto__" || column === "constructor" || column === "prototype") return;
      record[column] = row[i] ?? "";
    });
    return record;
  });
}

function tokenizeCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell === "") inQuotes = true;
    else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (inQuotes) throw new InvalidImportFileError("CSV: незакрытая кавычка");
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
