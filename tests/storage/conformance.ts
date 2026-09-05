import { afterAll, describe, expect, it } from "vitest";
import type { Storage } from "../../src/lib/storage/types";

export function testStorage(
  name: string,
  make: () => Promise<Storage>,
  cleanup?: () => Promise<void>,
) {
  describe(name, () => {
    afterAll(async () => {
      await cleanup?.();
    });

    it("round-trips binary content byte for byte", async () => {
      const storage = await make();
      const body = Buffer.from([0x00, 0xff, 0x10, 0x00, 0x7f]);
      await storage.put("k/bin", body, "application/octet-stream");
      expect(await storage.get("k/bin")).toEqual(body);
    });

    it("returns null for a missing key", async () => {
      const storage = await make();
      expect(await storage.get("k/absent")).toBeNull();
    });

    it("treats deleting a missing key as a no-op", async () => {
      const storage = await make();
      await expect(storage.delete("k/absent")).resolves.toBeUndefined();
    });

    it("removes content on delete", async () => {
      const storage = await make();
      await storage.put("k/gone", Buffer.from("x"), "text/plain");
      await storage.delete("k/gone");
      expect(await storage.get("k/gone")).toBeNull();
    });

    it("overwrites an existing key", async () => {
      const storage = await make();
      await storage.put("k/over", Buffer.from("one"), "text/plain");
      await storage.put("k/over", Buffer.from("two"), "text/plain");
      expect((await storage.get("k/over"))?.toString()).toBe("two");
    });

    it("exposes a url for a key", async () => {
      const storage = await make();
      expect(storage.url("k/bin")).toContain("k");
    });
  });
}
