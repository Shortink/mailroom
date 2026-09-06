import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

if (existsSync(".env")) process.loadEnvFile(".env");

// Tests truncate every table, so they must never point at the development
// database. TEST_DATABASE_URL wins; otherwise the dev database name gets a
// _test suffix.
function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;

  const url = new URL(process.env.DATABASE_URL ?? "postgres://localhost/mail");
  url.pathname = url.pathname.replace(/\/?$/, "") + "_test";
  return url.toString();
}

process.env.DATABASE_URL = testDatabaseUrl();

// Real values come from .env; these keep config validation satisfied for the
// settings a given test does not exercise.
process.env.RESEND_API_KEY ||= "re_test";
process.env.RESEND_WEBHOOK_SECRET ||= "whsec_test";
process.env.SESSION_SECRET ||= "x".repeat(32);
process.env.RECONCILE_TOKEN ||= "y".repeat(32);
process.env.APP_URL ||= "http://localhost:3000";
process.env.STORAGE_DRIVER ||= "fs";
process.env.FS_STORAGE_PATH ||= "./storage/test";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    setupFiles: ["tests/setup.ts"],
  },
});
