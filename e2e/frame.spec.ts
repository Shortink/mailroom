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

test("the frame is tall enough for its own document, so nothing scrolls", async ({ page }) => {
  const threadId = await seedHtmlMessage("<p>A couple of lines.</p><p>And another.</p>");
  await page.goto(`/t/${threadId}`);
  await frameHeight(page);

  // Padding on the iframe element comes out of the height set on it, which left
  // the document a few pixels taller than the viewport showing it.
  const inner = page.frames().find((f) => f.url().startsWith("about:srcdoc"))!;
  const fits = await inner.evaluate(
    () => document.body.scrollHeight <= document.documentElement.clientHeight,
  );
  expect(fits).toBe(true);
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

test("a style block survives, and what it could fetch with does not", async ({ page }) => {
  const threadId = await seedHtmlMessage(
    `<style>.card{padding:20px;color:#b91c1c}.bad{background:url(https://tracker.example/p.gif)}</style>` +
      `<div class="card">Styled by a block.</div>`,
  );
  await page.goto(`/t/${threadId}`);

  const srcdoc = await page.locator('iframe[title="Message"]').getAttribute("srcdoc");
  expect(srcdoc).toContain("padding:20px");
  expect(srcdoc).not.toContain("tracker.example");
});

test("images from a sender can be allowed for good, and taken back", async ({ page }) => {
  const threadId = await seedHtmlMessage('<p>Sale</p><img src="https://images.example/banner.png" alt="">');
  await page.goto(`/t/${threadId}`);

  const imageSrc = () =>
    page
      .frames()
      .find((f) => f.url().startsWith("about:srcdoc"))!
      .locator("img")
      .getAttribute("src");

  await expect(page.getByText("Remote images blocked.")).toBeVisible();
  expect(await imageSrc()).toBeNull();

  await page.getByRole("button", { name: "Always from this sender" }).click();
  await expect(page.getByText("always load.")).toContainText("sender@html.example");

  // A reload shows the server decided it, not something the page kept.
  await page.reload();
  await expect(page.getByText("always load.")).toBeVisible();
  expect(await imageSrc()).toBe("https://images.example/banner.png");

  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText("Remote images blocked.")).toBeVisible();
});

test("an allowed sender can be removed from settings", async ({ page }) => {
  const threadId = await seedHtmlMessage('<img src="https://images.example/banner.png" alt="">');
  await page.goto(`/t/${threadId}`);
  await page.getByRole("button", { name: "Always from this sender" }).click();
  await expect(page.getByText("always load.")).toBeVisible();

  await page.goto("/settings");
  const row = page.getByRole("listitem").filter({ hasText: "sender@html.example" });
  await row.getByRole("button", { name: "Remove" }).click();
  await expect(row).toHaveCount(0);
});

test("images load without asking once settings say so, except on failed mail", async ({ page }) => {
  await page.goto("/settings");
  const saved = page.waitForResponse((response) => response.request().method() === "POST");
  await page.getByRole("switch", { name: "Load remote images without asking" }).click();
  await saved;

  const threadId = await seedHtmlMessage('<img src="https://images.example/banner.png" alt="">');
  await page.goto(`/t/${threadId}`);
  await expect(page.locator('iframe[title="Message"]')).toBeVisible();
  await expect(page.getByText("Remote images blocked.")).toHaveCount(0);

  const forged = await seedHtmlMessage('<img src="https://images.example/banner.png" alt="">', {
    dmarc: "mx.example; spf=fail smtp.mailfrom=html.example; dmarc=fail",
  });
  await page.goto(`/t/${forged}`);
  await expect(page.getByText("This message failed authentication")).toBeVisible();
  await expect(page.getByRole("button", { name: "Always from this sender" })).toHaveCount(0);
});
