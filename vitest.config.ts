import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

if (existsSync(".env")) process.loadEnvFile(".env");

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
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
  },
});
