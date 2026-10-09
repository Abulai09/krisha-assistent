import { SourceNotConnectedError, type ListingSource, type SourceStatus } from "./types";

/**
 * Адаптер для будущего разрешённого доступа к данным Krisha.kz.
 *
 * Пользовательское соглашение Krisha.kz (п. 5.3, 5.5.6, 8.1) запрещает автоматизированный доступ
 * и извлечение объявлений без письменного разрешения АО «Колёса». Поэтому здесь нет сбора данных
 * со страниц сайта. Когда появится официальный API или фид по договору, реализуйте fetchListings
 * по его документации и верните записи в формате rawListingSchema (см. docs/data-sources.md).
 */
export class KrishaApiSource implements ListingSource {
  readonly key = "krisha-api";
  readonly name = "Krisha.kz (официальный доступ)";
  readonly kind = "API" as const;
  readonly isSynthetic = false;
  readonly providesFullSnapshot = true;

  static readonly NOT_CONNECTED_MESSAGE =
    "Не подключён: нет письменного разрешения АО «Колёса» и официального API. Сбор данных с сайта не выполняется.";

  async checkStatus(): Promise<SourceStatus> {
    return { availability: "NOT_CONNECTED", message: KrishaApiSource.NOT_CONNECTED_MESSAGE };
  }

  async fetchListings(): Promise<unknown[]> {
    throw new SourceNotConnectedError(KrishaApiSource.NOT_CONNECTED_MESSAGE);
  }
}
