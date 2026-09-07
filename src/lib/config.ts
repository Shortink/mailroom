import { z } from "zod";

// What the app needs before it can serve a request. The Resend key, webhook
// secret and reconcile token are checked where they are used instead: the
// webhook secret only exists once the app is running and the webhook is made.
const base = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
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
export type StorageConfig = ReturnType<typeof parseStorageConfig>;

function withoutBlanks(rawEnv: Record<string, unknown>) {
  // A blank line in .env arrives as "", which is absence rather than a bad value.
  return Object.fromEntries(Object.entries(rawEnv).filter(([, value]) => value !== ""));
}

function describe(issues: { path: PropertyKey[]; message: string }[]) {
  const lines = issues.map(
    (issue) => "  " + (issue.path.join(".") || "STORAGE_DRIVER") + ": " + issue.message,
  );
  return "Invalid configuration:\n" + lines.join("\n");
}

// Storage parses on its own, so reading mail does not require the settings that
// belong to sending or to the webhook.
export function parseStorageConfig(rawEnv: Record<string, unknown>) {
  const parsed = storage.safeParse(withoutBlanks(rawEnv));
  if (!parsed.success) throw new Error(describe(parsed.error.issues));
  return parsed.data;
}

export function parseConfig(rawEnv: Record<string, unknown>) {
  const env = withoutBlanks(rawEnv);

  const parsedBase = base.safeParse(env);
  const parsedStorage = storage.safeParse(env);

  if (!parsedBase.success || !parsedStorage.success) {
    const issues = [
      ...(parsedBase.success ? [] : parsedBase.error.issues),
      ...(parsedStorage.success ? [] : parsedStorage.error.issues),
    ];
    throw new Error(describe(issues));
  }

  return {
    ...parsedBase.data,
    requireTotp: parsedBase.data.REQUIRE_TOTP === "true",
    storage: parsedStorage.data,
  };
}

let cached: Config | undefined;

export function getConfig() {
  cached ??= parseConfig(process.env);
  return cached;
}
