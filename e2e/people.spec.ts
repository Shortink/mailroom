import { expect, test, type Page } from "@playwright/test";
import { OPERATOR, resetDatabase, seedAddressThread } from "./fixture";

const ALEX = "alex@example.com";
const MEMBER = { email: "friend@example.net", password: "member-e2e-password" };

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("/");
}

test.beforeEach(async () => {
  await resetDatabase();
  await seedAddressThread(ALEX, "Welcome to your inbox");
  await seedAddressThread(ALEX, "Could not be fetched", "failed");
});

test("a member sees only their address, and the owner can look in", async ({ page, browser }) => {
  await signIn(page, OPERATOR.email, OPERATOR.password);
  await page.goto("/settings");

  // alex@ has mail but is not pinned, so the invite has to carry it by itself.
  await page.getByRole("button", { name: "Invite someone" }).click();
  await page.getByPlaceholder("Another address").fill(ALEX);
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /create invite link/i }).click();
  const link = (await page.getByText(/\/invite\//).textContent())!.trim();

  const member = await (await browser.newContext()).newPage();
  // The link carries the configured public origin, not the e2e server.
  await member.goto(new URL(link).pathname);
  await member.getByLabel("Email").fill(MEMBER.email);
  await member.getByLabel("Password").fill(MEMBER.password);
  await member.getByRole("button", { name: "Create account" }).click();
  await member.waitForURL(/\/login\/enrol/);

  // The e2e server runs with TOTP off, so signing in again gives a full session.
  await member.context().clearCookies();
  await signIn(member, MEMBER.email, MEMBER.password);

  await expect(member.getByText("Welcome to your inbox", { exact: true })).toBeVisible();
  await expect(member.getByText("Your payout of $2,480.00 is on the way")).toHaveCount(0);
  await expect(member.getByLabel("Choose whose mail to show")).toHaveCount(0);
  await expect(member.getByText(/not fetched/i)).toBeVisible();
  await expect(member.getByRole("button", { name: /try again/i })).toHaveCount(0);

  await member.getByRole("button", { name: /compose|new message/i }).first().click();
  await expect(member.getByText(ALEX, { exact: true }).last()).toBeVisible();
  await expect(member.locator("button", { hasText: ALEX })).toHaveCount(0);

  await page.goto("/");
  await page.getByLabel("Choose whose mail to show").click();
  await page.getByRole("button", { name: ALEX }).click();
  await page.waitForURL("/");
  await expect(page.getByText("Welcome to your inbox", { exact: true })).toBeVisible();
});
