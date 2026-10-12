import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN_LOGIN, E2E_ADMIN_PASSWORD } from "./constants";

async function login(page: Page, password = E2E_ADMIN_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Логин").fill(E2E_ADMIN_LOGIN);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  if (password === E2E_ADMIN_PASSWORD) {
    await expect(page.getByRole("link", { name: "Управление" })).toBeVisible();
    await page.goto("/admin");
  }
}

test.describe.configure({ mode: "serial" });

test.describe("управление", () => {
  test("без входа «Управление» отправляет на вход, неверный пароль не пускает", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login$/);
    await login(page, "wrong-password-123");
    await expect(page.locator("form").getByRole("alert")).toHaveText("Неверный логин или пароль.");
    await expect(page.getByRole("link", { name: "Управление" })).toHaveCount(0);
  });

  test("вход, ручной запуск и ограничение частоты", async ({ page }) => {
    await login(page);
    await expect(page.getByText("Журнал запусков", { exact: true })).toBeVisible();
    await expect(page.getByText("Фоновый процесс не запущен")).toBeVisible();

    const syntheticCard = page.locator("div.rounded-lg.border").filter({ hasText: "Синтетические тестовые данные" });
    await syntheticCard.getByRole("button", { name: "Обновить сейчас" }).click();
    await expect(syntheticCard.getByRole("status")).toContainText("поставлено в очередь");

    await syntheticCard.getByRole("button", { name: "Обновить сейчас" }).click();
    await expect(syntheticCard.getByRole("alert")).toContainText("уже в очереди");
    await expect(page.locator("table").getByText("В очереди")).toBeVisible();

    await page.getByRole("link", { name: "Журнал действий" }).click();
    await expect(page.getByText("Обновление поставлено в очередь").first()).toBeVisible();
    await expect(page.getByText("Вход администратора").first()).toBeVisible();
  });

  test("импорт: некорректный файл отклоняется с понятной ошибкой", async ({ page }) => {
    await login(page);
    await page.getByLabel("Файл CSV или JSON").setInputFiles({
      name: "bad.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("externalId,priceKzt\nA,дорого\n"),
    });
    await page.getByRole("button", { name: "Загрузить и импортировать" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Ни одно объявление не прошло проверку");
  });

  test("импорт: бинарный файл под видом CSV отклоняется", async ({ page }) => {
    await login(page);
    await page.getByLabel("Файл CSV или JSON").setInputFiles({
      name: "image.csv",
      mimeType: "text/csv",
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe]),
    });
    await page.getByRole("button", { name: "Загрузить и импортировать" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("текстовым CSV или JSON");
  });

  test("база данных: таблицы, строки и страницы", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "База данных" }).click();
    await expect(page.getByRole("progressbar", { name: "Заполненность базы" })).toBeVisible();
    await expect(page.getByText("Автоочистка", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: /Объявления/ }).click();
    await expect(page.getByRole("heading", { name: /Объявления/ })).toBeVisible();
    await expect(page.getByText(/Страница 1 из \d+/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Удалить" }).first()).toBeVisible();
  });

  test("выход завершает сессию", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "Выйти" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login$/);
  });
});
