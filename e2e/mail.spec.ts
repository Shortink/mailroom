import { expect, test, type Page } from "@playwright/test";
import { OPERATOR, resetDatabase, UNREAD_COUNT } from "./fixture";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OPERATOR.email);
  await page.getByLabel("Password").fill(OPERATOR.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "All mail" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  // Each test starts from the same mail, so one opening a thread cannot change
  // what the next one sees.
  await resetDatabase();
  await signIn(page);
});

test("shows the rail, the list and the reading pane together", async ({ page }) => {
  await expect(page.getByRole("link", { name: "All mail" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "All mail" })).toBeVisible();
  await expect(page.getByText("No message selected")).toBeVisible();

  // Column widths are part of the design, not an accident of content.
  const rail = page.locator("aside");
  await expect(rail).toHaveCSS("width", "238px");
});

test("the list column is interactive on a full page load", async ({ page }) => {
  // Regression: a loading boundary beside the parallel slots left this column
  // as inert server HTML, so nothing in it responded to a click.
  await page.goto("/");

  await page.getByRole("button", { name: "Search all addresses" }).click();
  await expect(page.getByRole("dialog", { name: "Search mail" })).toBeVisible();
});

test("opening a thread clears its unread badge everywhere", async ({ page }) => {
  const railAllMail = page.getByRole("link", { name: "All mail" });
  await expect(railAllMail).toContainText(String(UNREAD_COUNT));

  await page.getByRole("link", { name: /Stripe:/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("payout");

  // The count lives in a sibling slot, so this only passes if marking read
  // revalidates rather than happening during the thread render.
  await expect(railAllMail).toContainText(String(UNREAD_COUNT - 1));
});

test("prefetching a thread does not mark it read", async ({ page }) => {
  // Regression: marking read during render meant Next prefetching a row was
  // enough to lose the unread state without anyone opening it.
  await page.goto("/");
  await page.mouse.move(400, 300);
  await page.waitForTimeout(1500);

  await expect(page.getByRole("link", { name: "All mail" })).toContainText(String(UNREAD_COUNT));
});

test("abandoning a reply leaves no draft behind", async ({ page }) => {
  await page.getByRole("link", { name: /Stripe:/ }).click();
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(page.getByPlaceholder("Write your message")).toBeVisible();

  // A reply opens with its recipient and subject filled in; that alone is not
  // something worth keeping.
  await page.getByRole("button", { name: "Close" }).click();
  await page.waitForTimeout(1200);

  await page.getByRole("link", { name: "Drafts" }).click();
  await expect(page.getByText("No drafts")).toBeVisible();
});

test("a written reply is kept as a draft", async ({ page }) => {
  await page.getByRole("link", { name: /Stripe:/ }).click();
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await page.getByPlaceholder("Write your message").fill("Thanks, nothing needed here.");

  await expect(page.getByText("draft saved")).toBeVisible();

  await page.getByRole("link", { name: "Drafts" }).click();
  await expect(page.getByText("Thanks, nothing needed here.")).toBeVisible();
});

test("search spans every address and marks the match", async ({ page }) => {
  await page.getByRole("button", { name: "Search all addresses" }).click();

  const dialog = page.getByRole("dialog", { name: "Search mail" });
  await dialog.getByRole("textbox").fill("invoice");

  await expect(dialog.getByText(/results · searching every address/)).toBeVisible();
  await expect(dialog.locator("mark").first()).toHaveText(/invoice/i);
});

test("address settings save and come back", async ({ page }) => {
  await page.goto("/settings/hi%40example.com");

  await expect(page.locator("main h1")).toHaveText("hi");
  await page.getByRole("switch").click();

  await page.reload();
  await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "true");
});
