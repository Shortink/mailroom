import { getConfig, type Config } from "../config";
import { FsStorage } from "./fs";
import { PostgresStorage } from "./postgres";
import { S3Storage } from "./s3";
import type { Storage } from "./types";

export function createStorage(settings: Config["storage"]): Storage {
  switch (settings.STORAGE_DRIVER) {
    case "fs":
      return new FsStorage(settings.FS_STORAGE_PATH);
    case "s3":
      return new S3Storage({
        bucket: settings.S3_BUCKET,
        region: settings.S3_REGION,
        endpoint: settings.S3_ENDPOINT,
        accessKeyId: settings.S3_ACCESS_KEY_ID,
        secretAccessKey: settings.S3_SECRET_ACCESS_KEY,
      });
    case "postgres":
      return new PostgresStorage();
    default:
      throw new Error(`Unknown STORAGE_DRIVER: ${(settings as { STORAGE_DRIVER: string }).STORAGE_DRIVER}`);
  }
}

let cached: Storage | undefined;

export function getStorage() {
  cached ??= createStorage(getConfig().storage);
  return cached;
}
