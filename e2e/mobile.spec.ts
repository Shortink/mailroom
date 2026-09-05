import { expect, test } from "@playwright/test";
import { OPERATOR, resetDatabase } from "./fixture";

test.use({ viewport: { width: 390, height: 844 } });

test("phone-width layout is usable", async ({ page }) => {
  await resetDatabase();

  await page.goto("/login");
  await page.getByLabel("Email").fill(OPERATOR.email);
  await page.getByLabel("Password").fill(OPERATOR.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "All mail" })).toBeVisible();

  const measured = await page.evaluate(() => {
    const de = document.documentElement;
    const rail = document.querySelector("aside");
    const list = rail?.nextElementSibling as HTMLElement | null;
    const main = document.querySelector("main");
    const box = (el: Element | null | undefined) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), width: Math.round(r.width) };
    };
    return {
      viewport: window.innerWidth,
      overflows: de.scrollWidth > de.clientWidth,
      rail: box(rail),
      list: box(list),
      main: box(main),
    };
  });

  await page.screenshot({ path: "test-results/phone-inbox.png" });
  console.log("PHONE LAYOUT", JSON.stringify(measured, null, 1));

  // The list gets the whole width, and nothing runs off the side.
  expect(measured.overflows).toBe(false);
  expect(measured.list!.width).toBe(390);
  expect(measured.list!.left).toBe(0);
});

test("a thread replaces the list and the back control returns", async ({ page }) => {
  await resetDatabase();

  await page.goto("/login");
  await page.getByLabel("Email").fill(OPERATOR.email);
  await page.getByLabel("Password").fill(OPERATOR.password);
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("link", { name: /Stripe:/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("payout");

  // One column at a time: the list steps aside for the pane.
  await expect(page.getByRole("heading", { name: "All mail" })).toBeHidden();
  await page.screenshot({ path: "test-results/phone-thread.png" });

  await page.getByRole("button", { name: "Back to mail" }).click();
  await expect(page.getByRole("heading", { name: "All mail" })).toBeVisible();
});

test("the rail opens as a drawer", async ({ page }) => {
  await resetDatabase();

  await page.goto("/login");
  await page.getByLabel("Email").fill(OPERATOR.email);
  await page.getByLabel("Password").fill(OPERATOR.password);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("link", { name: "Sent" })).not.toBeInViewport();
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("link", { name: "Sent" })).toBeInViewport();

  await page.getByRole("link", { name: "Sent" }).click();
  await expect(page.getByRole("heading", { name: "Sent" })).toBeVisible();
});
