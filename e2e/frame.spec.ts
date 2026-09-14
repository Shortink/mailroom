import { expect, test, type Page } from "@playwright/test";
import { OPERATOR, resetDatabase, seedHtmlMessage } from "./fixture";

// The height every frame was fixed at before it measured itself.
const OLD_FIXED_HEIGHT = 320;

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OPERATOR.email);
  await page.getByLabel("Password").fill(OPERATOR.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "All mail" })).toBeVisible();
}

async function frameHeight(page: Page) {
  const frame = page.locator('iframe[title="Message"]');
  await expect(frame).toBeVisible();

  // The height arrives from inside the frame, so it is not there on first paint.
  await expect
    .poll(async () => (await frame.boundingBox())?.height ?? 0, { timeout: 5000 })
    .not.toBe(OLD_FIXED_HEIGHT);

  return (await frame.boundingBox())!.height;
}

test.beforeEach(async ({ page }) => {
  await resetDatabase();
  await signIn(page);
});

test("a short message gets a frame that fits it", async ({ page }) => {
  const threadId = await seedHtmlMessage("<p>One line, and nothing else.</p>");
  await page.goto(`/t/${threadId}`);

  expect(await frameHeight(page)).toBeLessThan(120);
});

test("a long message gets a frame taller than the old fixed one", async ({ page }) => {
  const paragraphs = Array.from({ length: 60 }, (_, i) => `<p>Paragraph ${i} of a long one.</p>`);
  const threadId = await seedHtmlMessage(paragraphs.join(""));
  await page.goto(`/t/${threadId}`);

  // Tall enough that a fixed frame would have scrolled it instead.
  expect(await frameHeight(page)).toBeGreaterThan(OLD_FIXED_HEIGHT * 2);
});

test("the frame runs its own script without gaining the app origin", async ({ page }) => {
  const threadId = await seedHtmlMessage("<p>Ordinary.</p>");
  await page.goto(`/t/${threadId}`);

  const frame = page.locator('iframe[title="Message"]');
  await expect(frame).toBeVisible();

  // Scripts are allowed so the height can be measured. Same-origin access
  // must never join them: together they hand a message the cookies and DOM.
  const sandbox = await frame.getAttribute("sandbox");
  expect(sandbox).toContain("allow-scripts");
  expect(sandbox).not.toContain("allow-same-origin");

  // The document admits one script, the one named by the nonce.
  const srcdoc = await frame.getAttribute("srcdoc");
  expect(srcdoc).toMatch(/content="script-src 'nonce-[\w-]+'/);
});
