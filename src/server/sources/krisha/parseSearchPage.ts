import { parse, type HTMLElement } from "node-html-parser";

// Разбор страницы выдачи krisha.kz/prodazha/kvartiry/almaty/ в записи формата rawListingSchema.
// Только чтение HTML, без сети. Всё, что не удалось уверенно распознать, — null:
// проверку и отбраковку делает конвейер, характеристики здесь не додумываются.

export const KRISHA_ORIGIN = "https://krisha.kz";

/** Поля rawListingSchema; нераспознанные — null. Проверяет и отбраковывает конвейер. */
export type ParsedCard = { externalId: string } & Record<string, string | number | boolean | null>;

export interface SearchPage {
  listings: ParsedCard[];
  /** На странице нет карточек — выдача закончилась (или вёрстка изменилась). */
  isEmpty: boolean;
}

export function parseSearchPage(html: string): SearchPage {
  const root = parse(html);
  const cards = root.querySelectorAll("div.a-card[data-id]").filter((card) => /^\d+$/.test(card.getAttribute("data-id") ?? ""));
  return { listings: cards.map(parseCard), isEmpty: cards.length === 0 };
}

function parseCard(card: HTMLElement): ParsedCard {
  const externalId = card.getAttribute("data-id")!;
  const title = parseTitle(text(card, ".a-card__title"));
  const location = parseSubtitle(text(card, ".a-card__subtitle"));
  const preview = parsePreview(text(card, ".a-card__text-preview"));

  return {
    externalId,
    url: `${KRISHA_ORIGIN}/a/show/${externalId}`,
    city: "Алматы",
    dealType: "продажа",
    propertyType: "квартира",
    priceKzt: parsePrice(text(card, ".a-card__price")),
    ...title,
    ...location,
    ...preview,
    sellerType: toSellerType(card),
  };
}

function text(card: HTMLElement, selector: string): string {
  return (card.querySelector(selector)?.text ?? "").replace(/\s+/g, " ").trim();
}

/** «37 000 000 ₸» → 37000000. «от 21 120 300 ₸» (цена новостройки «от») — не точная цена, null. */
export function parsePrice(value: string): number | null {
  if (/^от\s/i.test(value)) return null;
  const digits = value.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

/** «2-комнатная квартира · 54.6 м² · 11/12 этаж» → комнаты, площадь, этаж/этажность. */
export function parseTitle(value: string) {
  const rooms = value.match(/(\d+)-комнатная/)?.[1];
  const area = value.match(/([\d.,]+)\s*м²/)?.[1];
  const floors = value.match(/(-?\d+)(?:\/(\d+))?\s*этаж/);
  return {
    rooms: rooms ? Number(rooms) : null,
    totalArea: area ?? null,
    floor: floors ? Number(floors[1]) : null,
    floorsTotal: floors?.[2] ? Number(floors[2]) : null,
  };
}

/** «Ауэзовский р-н, мкр Мамыр-4 314» → район, микрорайон, адрес. Без района — null (запись отклонит проверка). */
export function parseSubtitle(value: string) {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  const districtIndex = parts.findIndex((part) => /\sр-н$/.test(part));
  const district = districtIndex >= 0 ? parts[districtIndex] : null;
  const rest = parts.filter((_, index) => index !== districtIndex);
  // «мкр Мамыр-4 314» → «Мамыр-4»: отрезаем ориентир после « — » и номер дома в конце.
  const microdistrict = rest
    .find((part) => part.startsWith("мкр "))
    ?.split(" — ")[0]
    .replace(/^мкр\s+/, "")
    .replace(/\s+\d\S*$/, "");
  return {
    district,
    microdistrict: microdistrict || null,
    address: rest.length > 0 ? rest.join(", ") : null,
  };
}

/**
 * Начало превью — перечень характеристик через запятую:
 * «жил. комплекс Saulet, монолитный дом, 2026 г.п., состояние: черновая отделка, потолки 2.7м., …, без мебели, <текст>».
 */
export function parsePreview(value: string) {
  return {
    complexName: value.match(/жил\. комплекс ([^,]+)/)?.[1].trim() ?? null,
    buildingType: value.match(/(панельный|кирпичный|монолитный|иной) дом/)?.[1] ?? null,
    yearBuilt: value.match(/(\d{4}) г\.п\./)?.[1] ?? null,
    // «не новый, но аккуратный ремонт» — единственное значение с запятой внутри.
    condition: value.match(/состояние: (не новый, но аккуратный ремонт|[^,]+)/)?.[1].trim() ?? null,
    ceilingHeight: value.match(/потолки ([\d.]+)м/)?.[1] ?? null,
    kitchenArea: value.match(/кухня ([\d.,]+) м²/)?.[1] ?? null,
    livingArea: value.match(/жил\. площадь ([\d.,]+) м²/)?.[1] ?? null,
    furnished: /меблирована/.test(value) ? true : /без мебели/.test(value) ? false : null,
  };
}

/**
 * Кто продаёт, по метке под карточкой. Классы, которые встречаются в выдаче:
 * - `user-label-owner` — «Хозяин недвижимости»;
 * - `user-label-identified-specialist` — «Крыша Агент» или «Специалист»;
 * - блок `.a-card__complex-info` с «от застройщика …» — карточка новостройки.
 * Возвращает строку, понятную SELLER_TYPE_ALIASES («собственник» / «агент» / «застройщик»), или null.
 *
 * Метка продавца важнее блока ЖК: новостройку часто продаёт агент, и торговаться покупатель будет с ним.
 */
function toSellerType(card: HTMLElement): string | null {
  const owner = card.querySelector(".a-card__owner");
  if (owner?.classList.contains("user-label-owner")) return "собственник";
  if (owner?.classList.contains("user-label-identified-specialist")) return "агент";
  if (text(card, ".a-card__complex-info").includes("от застройщика")) return "застройщик";
  return null;
}
