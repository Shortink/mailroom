import { expect, test, type Page } from "@playwright/test";
import { OPERATOR, resetDatabase, seedHtmlMessage } from "./fixture";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OPERATOR.email);
  await page.getByLabel("Password").fill(OPERATOR.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "All mail" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await resetDatabase();
  await signIn(page);
});

test("the raw headers drawer opens on the message that carried them", async ({ page }) => {
  const threadId = await seedHtmlMessage("<p>With headers.</p>", {
    headers: { "message-id": "<abc@html.example>", "return-path": "bounce@html.example" },
  });
  await page.goto(`/t/${threadId}`);

  await expect(page.getByText("<abc@html.example>")).toBeHidden();
  await page.getByRole("button", { name: "Show raw headers" }).click();
  await expect(page.getByText("<abc@html.example>")).toBeVisible();
});

test("the auth chip reports what the message actually claimed", async ({ page }) => {
  const passed = await seedHtmlMessage("<p>Signed.</p>", {
    dmarc: "mx.example.com; spf=pass; dkim=pass; dmarc=pass",
  });
  await page.goto(`/t/${passed}`);
  await expect(page.getByText("spf pass · dkim pass · dmarc pass")).toBeVisible();

  const silent = await seedHtmlMessage("<p>Unsigned.</p>");
  await page.goto(`/t/${silent}`);
  await expect(page.getByText("no authentication results")).toBeVisible();
});

test("the render path is named and can be swapped for the plain part", async ({ page }) => {
  const threadId = await seedHtmlMessage("<p>The html part.</p>");
  await page.goto(`/t/${threadId}`);

  await expect(page.getByText("text/html · sandboxed")).toBeVisible();
  await expect(page.locator('iframe[title="Message"]')).toBeVisible();

  await page.getByRole("button", { name: "view plain text" }).click();
  await expect(page.locator('iframe[title="Message"]')).toBeHidden();
  // Scoped to the message: the same snippet is in the list row behind it.
  await expect(
    page.locator("article").getByText("A plain part too short to stand in for the html."),
  ).toBeVisible();
});

test("the thread actions stay reachable after scrolling a long thread", async ({ page }) => {
  const paragraphs = Array.from({ length: 80 }, (_, i) => `<p>Paragraph ${i}.</p>`).join("");
  const threadId = await seedHtmlMessage(paragraphs);
  await page.goto(`/t/${threadId}`);

  const archive = page.getByRole("button", { name: "Archive" });
  await expect(archive).toBeInViewport();

  await page.mouse.wheel(0, 3000);
  await expect(archive).toBeInViewport();
});
