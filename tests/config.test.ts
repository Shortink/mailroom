import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/lib/config";

const base = {
  DATABASE_URL: "postgres://localhost/mail",
  SESSION_SECRET: "x".repeat(32),
  APP_URL: "https://example.test",
  FORWARD_TO: "me@example.test",
};

describe("parseConfig", () => {
  it("names the missing variable", () => {
    const { DATABASE_URL, ...rest } = base;
    expect(() => parseConfig({ ...rest, STORAGE_DRIVER: "postgres" })).toThrow(/DATABASE_URL/);
  });

  it("names a session secret that is missing or too short", () => {
    const { SESSION_SECRET, ...rest } = base;
    expect(() => parseConfig({ ...rest, STORAGE_DRIVER: "postgres" })).toThrow(/SESSION_SECRET/);
    expect(() => parseConfig({ ...base, SESSION_SECRET: "short", STORAGE_DRIVER: "postgres" })).toThrow(
      /SESSION_SECRET/,
    );
  });

  it("requires S3_BUCKET when driver is s3", () => {
    expect(() => parseConfig({ ...base, STORAGE_DRIVER: "s3" })).toThrow(/S3_BUCKET/);
  });

  it("requires FS_STORAGE_PATH when driver is fs", () => {
    expect(() => parseConfig({ ...base, STORAGE_DRIVER: "fs" })).toThrow(/FS_STORAGE_PATH/);
  });

  it("rejects an unknown driver by name", () => {
    expect(() => parseConfig({ ...base, STORAGE_DRIVER: "dropbox" })).toThrow(/STORAGE_DRIVER/);
  });

  it("accepts a complete postgres-driver config", () => {
    const cfg = parseConfig({ ...base, STORAGE_DRIVER: "postgres" });
    expect(cfg.storage.STORAGE_DRIVER).toBe("postgres");
    expect(cfg.requireTotp).toBe(true);
  });

  it("reads the totp escape hatch", () => {
    const cfg = parseConfig({ ...base, STORAGE_DRIVER: "postgres", REQUIRE_TOTP: "false" });
    expect(cfg.requireTotp).toBe(false);
  });
});
