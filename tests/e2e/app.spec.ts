import { expect, test } from "@playwright/test";

test.describe("публичные страницы", () => {
  test("обзор показывает показатели и честно предупреждает о тестовых данных", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Обзор рынка" })).toBeVisible();
    await expect(page.getByRole("note")).toContainText("синтетические тестовые объявления");
    await expect(page.getByText("Активных объявлений")).toBeVisible();
    await expect(page.getByText("Синтетические тестовые данные").first()).toBeVisible();
  });

  test("каталог по умолчанию показывает квартиры со скидкой от 8%", async ({ page }) => {
    await page.goto("/listings");
    await expect(page.getByText(/Найдено \d+ квартир\S* со скидкой от 8% к рынку/)).toBeVisible();
    const badges = page.locator("article").getByText(/−[\d,]+% к рынку/);
    await expect(badges.first()).toBeVisible();
    for (const text of await badges.allTextContents()) {
      expect(parsePercent(text)).toBeGreaterThanOrEqual(8);
    }
  });

  test("фильтр по району работает с данными из базы", async ({ page }) => {
    await page.goto("/listings");
    // На широком экране панель фильтров раскрывается сама.
    await expect(page.getByLabel("Район")).toBeVisible();
    await page.getByLabel("Район").selectOption("MEDEU");
    await page.getByLabel("Скидка к рынку от").selectOption("any");
    await page.getByRole("button", { name: "Показать" }).click();
    await expect(page).toHaveURL(/district=MEDEU/);
    const districts = await page.locator("article p.truncate").allTextContents();
    expect(districts.length).toBeGreaterThan(0);
    for (const text of districts) expect(text).toContain("Медеуский");
  });

  test("режим «Дешевле рынка» сортирует по убыванию скидки", async ({ page }) => {
    await page.goto("/listings?mode=discount");
    const values = (await page.locator("article").getByText(/−[\d,]+% к рынку/).allTextContents()).map(parsePercent);
    expect(values.length).toBeGreaterThan(2);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });

  test("страница квартиры объясняет оценку", async ({ page }) => {
    await page.goto("/listings");
    await page.locator("article h3 a").first().click();
    await expect(page.getByText("Почему объект попал в рейтинг")).toBeVisible();
    await expect(page.getByText("Как рассчитана рыночная стоимость")).toBeVisible();
    await expect(page.getByText("Скидка = (рынок − цена) / рынок × 100")).toBeVisible();
    await expect(page.getByText("Использованные аналоги")).toBeVisible();
    await expect(page.getByText("Ограничения оценки")).toBeVisible();
  });

  test("несуществующая квартира — понятная страница «не найдено»", async ({ page }) => {
    await page.goto("/listings/does-not-exist");
    await expect(page.getByText("Страница не найдена")).toBeVisible();
  });

  test("аналитика не делает выводов о динамике без данных", async ({ page }) => {
    await page.goto("/analytics");
    await expect(page.getByRole("cell", { name: "Медеуский" })).toBeVisible();
    await expect(page.getByText("Недостаточно накопленных данных")).toBeVisible();
  });
});

function parsePercent(text: string): number {
  return Number(text.replace(/[^\d,]/g, "").replace(",", "."));
}
