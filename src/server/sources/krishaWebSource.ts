import { getEnv } from "@/config/env";
import { sleep } from "@/lib/utils/async";
import { KRISHA_ORIGIN, parseSearchPage } from "./krisha/parseSearchPage";
import { SourceBlockedError, type ListingSource, type SourceStatus } from "./types";

/**
 * Сбор объявлений со страниц выдачи krisha.kz (продажа квартир, Алматы).
 *
 * Пользовательское соглашение Krisha.kz (п. 5.3, 5.5.6, 8.1) запрещает автоматизированный доступ без письменного
 * разрешения АО «Колёса» — см. docs/adr/0002. Поэтому источник выключен по умолчанию (KRISHA_WEB_ENABLED) и ведёт
 * себя «вежливо»: только разрешённые robots.txt страницы, по одной за раз с паузой, честный User-Agent.
 * Капчу, защиту SafeLine (HTTP 468) и блокировки не обходит: при первом признаке блокировки запуск
 * останавливается без повторов.
 *
 * Берёт только первые KRISHA_WEB_MAX_PAGES страниц (свежие объявления), поэтому полного среза нет и
 * отсутствие объявления в ответе не значит, что его сняли.
 */

const SEARCH_PATH = "/prodazha/kvartiry/almaty/";
const USER_AGENT = "AlmatyDealFinder/0.1 (+personal research; low-rate)";
const REQUEST_TIMEOUT_MS = 20_000;
/** 403/429 — отказ, 468 — проверка «вы не бот» от защиты SafeLine. */
const BLOCKED_STATUSES = new Set([403, 429, 468]);

export class KrishaWebSource implements ListingSource {
  readonly key = "krisha-web";
  readonly name = "Krisha.kz (страницы сайта)";
  readonly kind = "WEB" as const;
  readonly isSynthetic = false;
  readonly providesFullSnapshot = false;
  /** Выдачу читаем не целиком, поэтому «нет в ответе» ≠ «снято»: 14 дней без появления — устарело. */
  readonly staleAfterDays = 14;

  /** Страницы идут строго по одной с паузой — общего лимита конвейера (2 мин) на 20 страниц не хватит. */
  get fetchTimeoutMs(): number {
    const { KRISHA_WEB_MAX_PAGES, KRISHA_WEB_DELAY_MS } = getEnv();
    return KRISHA_WEB_MAX_PAGES * (KRISHA_WEB_DELAY_MS + REQUEST_TIMEOUT_MS);
  }

  constructor(private readonly fetchPage: (url: string) => Promise<Response> = defaultFetch) {}

  async checkStatus(): Promise<SourceStatus> {
    return getEnv().KRISHA_WEB_ENABLED
      ? { availability: "CONNECTED", message: `Включён: до ${getEnv().KRISHA_WEB_MAX_PAGES} стр. выдачи за запуск.` }
      : { availability: "NOT_CONNECTED", message: "Выключен. Включается переменной KRISHA_WEB_ENABLED=true." };
  }

  async fetchListings(): Promise<unknown[]> {
    const { KRISHA_WEB_ENABLED, KRISHA_WEB_MAX_PAGES, KRISHA_WEB_DELAY_MS } = getEnv();
    if (!KRISHA_WEB_ENABLED) throw new SourceBlockedError("Источник выключен (KRISHA_WEB_ENABLED).");

    // Платные «горячие» объявления повторяются на каждой странице — оставляем первое вхождение.
    const byId = new Map<string, unknown>();
    for (let page = 1; page <= KRISHA_WEB_MAX_PAGES; page++) {
      if (page > 1) await sleep(KRISHA_WEB_DELAY_MS);
      const html = await this.loadPage(page);
      const { listings, isEmpty } = parseSearchPage(html);
      if (isEmpty) break;
      for (const listing of listings) if (!byId.has(listing.externalId)) byId.set(listing.externalId, listing);
    }
    return [...byId.values()];
  }

  private async loadPage(page: number): Promise<string> {
    const url = `${KRISHA_ORIGIN}${SEARCH_PATH}${page > 1 ? `?page=${page}` : ""}`;
    const response = await this.fetchPage(url);
    const finalUrl = new URL(response.url || url);
    if (BLOCKED_STATUSES.has(response.status) || finalUrl.pathname.startsWith("/captcha")) {
      throw new SourceBlockedError(`Krisha.kz ограничил доступ (HTTP ${response.status}, стр. ${page}). Запуск остановлен.`);
    }
    if (!response.ok) throw new Error(`Krisha.kz ответил HTTP ${response.status} на стр. ${page}`);
    return response.text();
  }
}

function defaultFetch(url: string): Promise<Response> {
  return fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "ru" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}
