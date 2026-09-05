import { z } from "zod";

const base = z.object({
  DATABASE_URL: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  RESEND_WEBHOOK_SECRET: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  RECONCILE_TOKEN: z.string().min(32),
  APP_URL: z.url(),
  FORWARD_TO: z.email().optional(),
  REQUIRE_TOTP: z.enum(["true", "false"]).default("true"),
});

const storage = z.discriminatedUnion("STORAGE_DRIVER", [
  z.object({
    STORAGE_DRIVER: z.literal("fs"),
    FS_STORAGE_PATH: z.string().min(1),
  }),
  z.object({
    STORAGE_DRIVER: z.literal("s3"),
    S3_BUCKET: z.string().min(1),
    S3_REGION: z.string().default("auto"),
    S3_ENDPOINT: z.url().optional(),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
  }),
  z.object({
    STORAGE_DRIVER: z.literal("postgres"),
  }),
]);

export type Config = ReturnType<typeof parseConfig>;

export function parseConfig(env: Record<string, unknown>) {
  const parsedBase = base.safeParse(env);
  const parsedStorage = storage.safeParse(env);

  if (!parsedBase.success || !parsedStorage.success) {
    const issues = [
      ...(parsedBase.success ? [] : parsedBase.error.issues),
      ...(parsedStorage.success ? [] : parsedStorage.error.issues),
    ];
    const lines = issues.map((issue) => {
      const field = issue.path.join(".") || "STORAGE_DRIVER";
      return `  ${field}: ${issue.message}`;
    });
    throw new Error(`Invalid configuration:\n${lines.join("\n")}`);
  }

  return {
    ...parsedBase.data,
    requireTotp: parsedBase.data.REQUIRE_TOTP === "true",
    storage: { driver: parsedStorage.data.STORAGE_DRIVER, ...parsedStorage.data },
  };
}

let cached: Config | undefined;

export function getConfig() {
  cached ??= parseConfig(process.env);
  return cached;
}
