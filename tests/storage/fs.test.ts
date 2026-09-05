import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FsStorage } from "../../src/lib/storage/fs";
import { testStorage } from "./conformance";

let dir: string | undefined;

async function make() {
  dir ??= await mkdtemp(join(tmpdir(), "mailstore-"));
  return new FsStorage(dir);
}

testStorage("FsStorage", make, async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("FsStorage path safety", () => {
  it("refuses a key that escapes the storage root", async () => {
    const storage = await make();
    await expect(storage.put("../escaped", Buffer.from("x"), "text/plain")).rejects.toThrow(/escape/i);
  });
});
