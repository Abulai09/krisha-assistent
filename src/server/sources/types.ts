// Контракт источника объявлений. Конвейер обновления не знает, откуда пришли данные:
// синтетика, файл или (в будущем) разрешённый API подключаются одинаково.

export type SourceKind = "SYNTHETIC" | "FILE_IMPORT" | "API" | "WEB";
export type SourceAvailability = "CONNECTED" | "NOT_CONNECTED" | "ERROR";

export interface SourceDescriptor {
  /** Стабильный ключ, по нему источник хранится в таблице DataSource. */
  key: string;
  name: string;
  kind: SourceKind;
  /** Данные сгенерированы и не являются реальными объявлениями. */
  isSynthetic: boolean;
  /**
   * Каждый запуск возвращает полный срез активных объявлений.
   * Только для таких источников «объявления нет в ответе» означает «снято с публикации».
   */
  providesFullSnapshot: boolean;
}

export interface SourceStatus {
  availability: SourceAvailability;
  message: string;
}

export interface FetchContext {
  now: Date;
}

export interface ListingSource extends SourceDescriptor {
  checkStatus(): Promise<SourceStatus>;
  /**
   * Только для источников без полного среза: объявление, которого не было в ответах столько дней,
   * убирается из активных с причиной STALE. Не задано — такие объявления не трогаем.
   */
  readonly staleAfterDays?: number;
  /** Свой лимит времени на fetchListings (по умолчанию — общий лимит конвейера). */
  readonly fetchTimeoutMs?: number;
  /** Сырые записи без проверки — валидация выполняется конвейером. */
  fetchListings(context: FetchContext): Promise<unknown[]>;
}

/** Постоянная ошибка: повторять запрос бессмысленно. */
export class SourceNotConnectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceNotConnectedError";
  }
}

export class InvalidImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidImportFileError";
  }
}

/** Сайт ограничил доступ (капча, 403/429) или источник выключен: повтор только усугубит блокировку. */
export class SourceBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceBlockedError";
  }
}
