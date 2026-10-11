import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateRawListing } from "@/domain/listing/rawListingSchema";
import { parsePrice, parseSearchPage, parseSubtitle, parseTitle } from "@/server/sources/krisha/parseSearchPage";
import { KrishaWebSource } from "@/server/sources/krishaWebSource";
import { SourceBlockedError } from "@/server/sources/types";

const env = vi.hoisted(() => ({ KRISHA_WEB_ENABLED: true, KRISHA_WEB_MAX_PAGES: 3, KRISHA_WEB_DELAY_MS: 2_000 }));
vi.mock("@/config/env", () => ({ getEnv: () => env }));
vi.mock("@/lib/utils/async", () => ({ sleep: vi.fn(async () => {}) }));

const PAGE = readFileSync(path.join(import.meta.dirname, "fixtures/krisha-search-page.html"), "utf8");
const EMPTY_PAGE = "<html><body><section class='a-list'></section></body></html>";

describe("разбор выдачи krisha.kz", () => {
  it("достаёт характеристики из карточки и проходит проверку конвейера", () => {
    const { listings } = parseSearchPage(PAGE);
    expect(listings).toHaveLength(4);

    const result = validateRawListing(listings[0]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.listing).toMatchObject({
      externalId: "1000000001",
      url: "https://krisha.kz/a/show/1000000001",
      priceKzt: 37_000_000,
      rooms: 1,
      totalArea: 38,
      floor: 8,
      floorsTotal: 9,
      district: "ZHETYSU",
      complexName: "Тест Сити",
      buildingType: "MONOLITH",
      yearBuilt: 2026,
      condition: "ROUGH_FINISH",
      ceilingHeight: 2.7,
      furnished: false,
      sellerType: "AGENT",
    });
  });

  it("площади кухни и жилая, микрорайон без номера дома и ориентира", () => {
    const result = validateRawListing(parseSearchPage(PAGE).listings[1]);
    expect(result.ok && result.listing).toMatchObject({
      district: "AUEZOV",
      microdistrict: "Мамыр-4",
      kitchenArea: 6,
      livingArea: 42,
      condition: "EXCELLENT",
      furnished: true,
      sellerType: "OWNER",
    });
  });

  it("цена «от …» и адрес без района не превращаются в догадку — запись отклоняется", () => {
    const [, , fromPrice, noDistrict] = parseSearchPage(PAGE).listings;
    expect(fromPrice.priceKzt).toBeNull();
    expect(fromPrice.sellerType).toBe("застройщик");
    expect(noDistrict.sellerType).toBeNull();
    expect(validateRawListing(fromPrice).ok).toBe(false);
    expect(noDistrict.district).toBeNull();
    expect(noDistrict.condition).toBe("не новый, но аккуратный ремонт");
    expect(validateRawListing(noDistrict).ok).toBe(false);
  });

  it("мелкие разборщики", () => {
    expect(parsePrice("26 000 000 ₸")).toBe(26_000_000);
    expect(parsePrice("")).toBeNull();
    expect(parseTitle("2-комнатная квартира · 65 м² · 7 этаж")).toMatchObject({ floor: 7, floorsTotal: null });
    expect(parseSubtitle("Медеуский р-н, мкр Самал-2 69")).toEqual({
      district: "Медеуский р-н",
      microdistrict: "Самал-2",
      address: "мкр Самал-2 69",
    });
  });

  it("пустая страница — признак конца выдачи", () => {
    expect(parseSearchPage(EMPTY_PAGE).isEmpty).toBe(true);
  });
});

describe("источник krisha-web", () => {
  // У настоящего Response поле url только для чтения — подменяем его, чтобы изобразить редирект на капчу.
  const html = (body: string, status = 200, url = "https://krisha.kz/prodazha/kvartiry/almaty/") =>
    Object.defineProperty(new Response(body, { status }), "url", { value: url });

  beforeEach(() => {
    env.KRISHA_WEB_ENABLED = true;
  });

  it("обходит страницы по одной, останавливается на пустой и убирает повторы", async () => {
    const fetchPage = vi.fn(async (url: string) => html(url.includes("page=2") ? PAGE : url.includes("page=") ? EMPTY_PAGE : PAGE));
    const listings = await new KrishaWebSource(fetchPage).fetchListings();
    expect(fetchPage.mock.calls.map(([url]) => url)).toEqual([
      "https://krisha.kz/prodazha/kvartiry/almaty/",
      "https://krisha.kz/prodazha/kvartiry/almaty/?page=2",
      "https://krisha.kz/prodazha/kvartiry/almaty/?page=3",
    ]);
    expect(listings).toHaveLength(4);
  });

  it.each([429, 468])("капча или HTTP %i — остановка без повторов", async (status) => {
    const captcha = new KrishaWebSource(async () => html("", 200, "https://krisha.kz/captcha?back=1"));
    await expect(captcha.fetchListings()).rejects.toBeInstanceOf(SourceBlockedError);
    const tooMany = new KrishaWebSource(async () => html("", status));
    await expect(tooMany.fetchListings()).rejects.toBeInstanceOf(SourceBlockedError);
  });

  it("выключен по умолчанию: не делает запросов", async () => {
    env.KRISHA_WEB_ENABLED = false;
    const fetchPage = vi.fn();
    const source = new KrishaWebSource(fetchPage);
    expect((await source.checkStatus()).availability).toBe("NOT_CONNECTED");
    await expect(source.fetchListings()).rejects.toBeInstanceOf(SourceBlockedError);
    expect(fetchPage).not.toHaveBeenCalled();
  });
});
