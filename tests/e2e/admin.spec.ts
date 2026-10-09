import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN_TOKEN } from "./constants";

async function login(page: Page, token: string) {
  await page.goto("/admin");
  await page.getByLabel("Токен администратора").fill(token);
  await page.getByRole("button", { name: "Войти" }).click();
}

test.describe.configure({ mode: "serial" });

test.describe("управление", () => {
  test("неверный токен не пускает в панель", async ({ page }) => {
    await login(page, "wrong-token-value-123");
    await expect(page.locator("form").getByRole("alert")).toHaveText("Неверный токен администратора.");
    await expect(page.getByText("Журнал запусков", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Токен администратора")).toBeVisible();
  });

  test("вход, ручной запуск и ограничение частоты", async ({ page }) => {
    await login(page, E2E_ADMIN_TOKEN);
    await expect(page.getByText("Журнал запусков", { exact: true })).toBeVisible();
    await expect(page.getByText("Фоновый процесс не запущен")).toBeVisible();

    const syntheticCard = page.locator("div.rounded-lg.border").filter({ hasText: "Синтетические тестовые данные" });
    await syntheticCard.getByRole("button", { name: "Обновить сейчас" }).click();
    await expect(syntheticCard.getByRole("status")).toContainText("поставлено в очередь");

    await syntheticCard.getByRole("button", { name: "Обновить сейчас" }).click();
    await expect(syntheticCard.getByRole("alert")).toContainText("уже в очереди");
    await expect(page.locator("table").getByText("В очереди")).toBeVisible();
  });

  test("импорт: некорректный файл отклоняется с понятной ошибкой", async ({ page }) => {
    await login(page, E2E_ADMIN_TOKEN);
    await page.getByLabel("Файл CSV или JSON").setInputFiles({
      name: "bad.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("externalId,priceKzt\nA,дорого\n"),
    });
    await page.getByRole("button", { name: "Загрузить и импортировать" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Ни одно объявление не прошло проверку");
  });

  test("импорт: бинарный файл под видом CSV отклоняется", async ({ page }) => {
    await login(page, E2E_ADMIN_TOKEN);
    await page.getByLabel("Файл CSV или JSON").setInputFiles({
      name: "image.csv",
      mimeType: "text/csv",
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe]),
    });
    await page.getByRole("button", { name: "Загрузить и импортировать" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("текстовым CSV или JSON");
  });

  test("выход завершает сессию", async ({ page }) => {
    await login(page, E2E_ADMIN_TOKEN);
    await page.getByRole("button", { name: "Выйти" }).click();
    await expect(page.getByLabel("Токен администратора")).toBeVisible();
  });
});
