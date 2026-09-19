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
  const autoArchive = page.getByRole("switch", { name: "Auto-archive after 30 days" });
  await autoArchive.click();

  await page.reload();
  await expect(autoArchive).toHaveAttribute("aria-checked", "true");
});

test("a deleted thread waits in Trash and can come back", async ({ page }) => {
  await page.getByRole("link", { name: /Marcus Bell:/ }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page.getByRole("link", { name: /Marcus Bell:/ })).toHaveCount(0);

  await page.getByRole("link", { name: "Trash" }).click();
  await page.getByRole("link", { name: /Marcus Bell:/ }).click();
  await page.getByRole("button", { name: "Restore" }).click();

  await page.getByRole("link", { name: "All mail" }).click();
  await expect(page.getByRole("link", { name: /Marcus Bell:/ })).toBeVisible();
});

test("delete forever asks twice", async ({ page }) => {
  await page.getByRole("link", { name: /Marcus Bell:/ }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("link", { name: /Marcus Bell:/ })).toHaveCount(0);

  await page.getByRole("link", { name: "Trash" }).click();
  await page.getByRole("link", { name: /Marcus Bell:/ }).click();
  await page.getByRole("button", { name: "Delete forever" }).click();
  await page.getByRole("button", { name: "Click again to delete" }).click();

  await expect(page.getByText("Trash is empty")).toBeVisible();
});

test("addresses can be dragged into a new order that sticks", async ({ page }) => {
  const rows = page.locator("aside section").first().getByRole("link", { name: /\(.+@example\.com\)/ });
  await expect(rows).toHaveText([/billing/, /domains/, /hi/]);

  // Reloading before the save comes back would cancel it.
  const saved = page.waitForResponse((response) => response.request().method() === "POST");

  // A drag made before React has attached to the sidebar does nothing, and
  // there is no signal for that, so the drag is retried until it lands.
  await expect(async () => {
    await rows.nth(2).hover();
    const box = (await page.getByRole("button", { name: "Move hi up or down" }).boundingBox())!;
    const rowHeight = (await rows.nth(0).boundingBox())!.height;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - rowHeight * 2, { steps: 8 });
    await page.mouse.up();

    await expect(rows).toHaveText([/hi/, /billing/, /domains/], { timeout: 1000 });
  }).toPass();

  await saved;
  await page.reload();
  await expect(rows).toHaveText([/hi/, /billing/, /domains/]);
});

test("the arrow keys move an address one place", async ({ page }) => {
  const rows = page.locator("aside section").first().getByRole("link", { name: /\(.+@example\.com\)/ });

  // Retried for the same reason as the drag above.
  await expect(async () => {
    await page.getByRole("button", { name: "Move billing up or down" }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(rows).toHaveText([/domains/, /billing/, /hi/], { timeout: 1000 });
  }).toPass();

  // The grip keeps focus as its row moves, so a second press carries on.
  await page.keyboard.press("ArrowDown");
  await expect(rows).toHaveText([/domains/, /hi/, /billing/]);

  await page.keyboard.press("ArrowUp");
  await expect(rows).toHaveText([/domains/, /billing/, /hi/]);
});

test("an address moved back to catch-all stays there after its mail is read", async ({ page }) => {
  await page.goto("/settings/hi%40example.com");
  const keep = page.getByRole("switch", { name: "Keep under Addresses" });
  const saved = page.waitForResponse((response) => response.request().method() === "POST");
  await keep.click();
  await saved;

  await page.goto("/");
  await page.getByRole("link", { name: /Dana Whitfield:/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Booking");

  await page.reload();
  const catchAll = page.locator("aside section").nth(1);
  await expect(catchAll.getByRole("link", { name: "hi (hi@example.com)" })).toBeVisible();
});
