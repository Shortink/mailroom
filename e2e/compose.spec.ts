import { expect, test } from "@playwright/test";
import { OPERATOR, resetDatabase } from "./fixture";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OPERATOR.email);
  await page.getByLabel("Password").fill(OPERATOR.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "All mail" })).toBeVisible();
}

test("a minimised composer can be opened again", async ({ page }) => {
  await resetDatabase();
  await signIn(page);

  await page.getByRole("button", { name: "Compose" }).click();
  const body = page.getByPlaceholder("Write your message");
  await expect(body).toBeVisible();

  await page.getByRole("button", { name: "Minimise" }).click();
  await expect(body).toBeHidden();
  await page.screenshot({ path: "test-results/composer-minimised.png" });

  // The control has to say it reopens, not repeat what was just pressed.
  await expect(page.getByRole("button", { name: "Expand" })).toBeVisible();

  // The title bar stays on screen, so the same control has to bring it back.
  await page.getByRole("button", { name: "Expand" }).click();
  await expect(body).toBeVisible();
});

test("a minimised composer keeps what was typed", async ({ page }) => {
  await resetDatabase();
  await signIn(page);

  await page.getByRole("button", { name: "Compose" }).click();
  await page.getByPlaceholder("Write your message").fill("half a thought");

  await page.getByRole("button", { name: "Minimise" }).click();

  // Clicking the bar itself, not the icon, is the likely gesture.
  await page.getByText("New message", { exact: true }).click();

  await expect(page.getByPlaceholder("Write your message")).toHaveValue("half a thought");
});
