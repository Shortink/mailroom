import { describe, it } from "vitest";
import { S3Storage } from "../../src/lib/storage/s3";
import { testStorage } from "./conformance";

const endpoint = process.env.TEST_S3_ENDPOINT;

if (endpoint) {
  testStorage("S3Storage", async () =>
    new S3Storage({
      bucket: process.env.TEST_S3_BUCKET!,
      region: "auto",
      endpoint,
      accessKeyId: process.env.TEST_S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.TEST_S3_SECRET_ACCESS_KEY!,
    }),
  );
} else {
  describe.skip("S3Storage", () => {
    it("needs TEST_S3_ENDPOINT (for example a local MinIO) to run", () => {});
  });
}
