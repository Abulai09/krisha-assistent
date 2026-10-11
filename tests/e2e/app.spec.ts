import { expect, test } from "@playwright/test";

test.describe("публичные страницы", () => {
  test("обзор сразу показывает предложения и честно предупреждает о тестовых данных", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Выгодные квартиры в Алматы" })).toBeVisible();
    await expect(page.getByRole("note")).toContainText("тестовые объявления");
    await expect(page.getByText(/выгодн\S+ предложени/).first()).toBeVisible();
    await expect(page.locator("article").first()).toBeVisible();
    // Технические подробности свёрнуты, но доступны в один клик.
    await page.getByText("Состояние данных").click();
    await expect(page.getByText(/Синтетические тестовые данные/).first()).toBeVisible();
  });

  test("каталог по умолчанию показывает квартиры со скидкой от 8%", async ({ page }) => {
    await page.goto("/listings");
    await expect(page.getByText(/Найдено \d+ квартир\S* со скидкой от 8%/)).toBeVisible();
    const badges = page.locator("article").getByText(/−[\d,]+% к рынку/);
    await expect(badges.first()).toBeVisible();
    for (const text of await badges.allTextContents()) {
      expect(parsePercent(text)).toBeGreaterThanOrEqual(8);
    }
  });

  test("главные фильтры видны сразу, остальные — под «Ещё фильтры»", async ({ page }) => {
    await page.goto("/listings");
    await expect(page.getByLabel("Район")).toBeVisible();
    await expect(page.getByLabel("Состояние")).toBeHidden();
    await page.getByText("Ещё фильтры").click();
    await expect(page.getByLabel("Состояние")).toBeVisible();
  });

  test("фильтр по району работает с данными из базы", async ({ page }) => {
    await page.goto("/listings");
    // На широком экране панель фильтров раскрывается сама.
    await expect(page.getByLabel("Район")).toBeVisible();
    await page.getByLabel("Район").selectOption("MEDEU");
    await page.getByLabel("Дешевле рынка на").selectOption("any");
    await page.getByRole("button", { name: "Показать" }).click();
    await expect(page).toHaveURL(/district=MEDEU/);
    const districts = await page.locator("article p.truncate").allTextContents();
    expect(districts.length).toBeGreaterThan(0);
    for (const text of districts) expect(text).toContain("Медеуский");
  });

  test("режим «Самая большая скидка» сортирует по убыванию скидки", async ({ page }) => {
    await page.goto("/listings");
    await page.getByRole("link", { name: "Самая большая скидка" }).click();
    await expect(page).toHaveURL(/mode=discount/);
    const values = (await page.locator("article").getByText(/−[\d,]+% к рынку/).allTextContents()).map(parsePercent);
    expect(values.length).toBeGreaterThan(2);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });

  test("страница квартиры: сначала вердикт, подробности — по клику", async ({ page }) => {
    await page.goto("/listings");
    await page.locator("article h3 a").first().click();
    await expect(page.getByRole("region", { name: "Итог оценки" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Почему такая оценка" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Важно знать" })).toBeVisible();

    const formula = page.getByText("Скидка = (рынок − цена) / рынок × 100");
    await expect(formula).toBeHidden();
    await page.getByText("Как рассчитана стоимость").click();
    await expect(formula).toBeVisible();

    await page.getByText(/Похожие объявления \(\d+\)/).click();
    await expect(page.getByRole("columnheader", { name: "Похожесть" })).toBeVisible();
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
