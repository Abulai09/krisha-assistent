import { expect, test } from "@playwright/test";

test("на телефоне фильтры свёрнуты, список виден сразу и нет горизонтальной прокрутки", async ({ page }) => {
  await page.goto("/listings");
  await expect(page.getByLabel("Район")).toBeHidden();
  await expect(page.locator("article").first()).toBeVisible();

  await page.locator("summary").getByText("Фильтры").click();
  await expect(page.getByLabel("Район")).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
