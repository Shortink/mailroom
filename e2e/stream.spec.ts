import { expect, test } from "@playwright/test";
import { OPERATOR, resetDatabase } from "./fixture";

test("the stream refuses an unauthenticated connection", async ({ request }) => {
  await resetDatabase();

  // Two layers answer this: the proxy redirects to the login page, and the
  // route itself returns 401. Either way what must not come back is a stream.
  const response = await request.get("/api/stream");
  expect(response.headers()["content-type"] ?? "").not.toContain("text/event-stream");

  const direct = await request.get("/api/stream", { maxRedirects: 0 });
  expect(direct.status()).toBeGreaterThanOrEqual(300);
});

test("the stream opens for a signed-in operator", async ({ page }) => {
  await resetDatabase();

  await page.goto("/login");
  await page.getByLabel("Email").fill(OPERATOR.email);
  await page.getByLabel("Password").fill(OPERATOR.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "All mail" })).toBeVisible();

  const opened = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const source = new EventSource("/api/stream");
        source.onmessage = (event) => {
          source.close();
          resolve(event.data);
        };
        source.onerror = () => {
          source.close();
          resolve("error");
        };
      }),
  );

  expect(opened).toBe("ready");
});
