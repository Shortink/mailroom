import { describe, expect, it } from "vitest";
import { createStorage } from "../../src/lib/storage";
import { FsStorage } from "../../src/lib/storage/fs";
import { PostgresStorage } from "../../src/lib/storage/postgres";
import { S3Storage } from "../../src/lib/storage/s3";

describe("createStorage", () => {
  it("builds the fs driver", () => {
    expect(createStorage({ STORAGE_DRIVER: "fs", FS_STORAGE_PATH: "./tmp" })).toBeInstanceOf(FsStorage);
  });

  it("builds the postgres driver", () => {
    expect(createStorage({ STORAGE_DRIVER: "postgres" })).toBeInstanceOf(PostgresStorage);
  });

  it("builds the s3 driver", () => {
    const storage = createStorage({
      STORAGE_DRIVER: "s3",
      S3_BUCKET: "b",
      S3_REGION: "auto",
      S3_ACCESS_KEY_ID: "a",
      S3_SECRET_ACCESS_KEY: "s",
    });
    expect(storage).toBeInstanceOf(S3Storage);
  });

  it("names an unknown driver in the error", () => {
    expect(() => createStorage({ STORAGE_DRIVER: "dropbox" } as never)).toThrow(/dropbox/);
  });
});
