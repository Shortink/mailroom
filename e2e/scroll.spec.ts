import { expect, test } from "@playwright/test";
import { OPERATOR, resetDatabase } from "./fixture";

// Short enough that the seeded threads overflow and the list actually scrolls.
test.use({ viewport: { width: 1440, height: 400 } });

// The list scroller is identified by what it holds, not by its position: the
// rail and the reading pane carry the same class.
const LIST_SCROLLER = ".scroll-clean:has(a[href^='/t/'])";

test("opening a thread leaves the list where it was", async ({ page }) => {
  await resetDatabase();

  await page.goto("/login");
  await page.getByLabel("Email").fill(OPERATOR.email);
  await page.getByLabel("Password").fill(OPERATOR.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "All mail" })).toBeVisible();

  const scroller = page.locator(LIST_SCROLLER);
  await expect(scroller).toHaveCount(1);

  // Real wheel input, past the end so the list settles at the bottom.
  await scroller.hover();
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(300);

  const scrolled = await scroller.evaluate((el) => el.scrollTop);
  expect(scrolled).toBeGreaterThan(0);

  // The oldest thread, which is on screen once the list is at the bottom.
  // Clicking a row that is scrolled out of sight would make Playwright scroll
  // the list to reveal it first, and that scroll would be mistaken for a reset.
  await scroller.locator("a[href^='/t/']").last().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Invoice 219");
  await page.waitForTimeout(1500);

  const after = await page.locator(LIST_SCROLLER).evaluate((el) => el.scrollTop);
  expect(after).toBe(scrolled);
});
