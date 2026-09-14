import { describe, expect, it } from "vitest";
import { readUpTo } from "../../src/lib/mail/stream";

function stream(...chunks: number[][]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk));
      controller.close();
    },
  });
}

describe("readUpTo", () => {
  it("joins the chunks", async () => {
    expect(await readUpTo(stream([1, 2], [3]), 8)).toEqual(Buffer.from([1, 2, 3]));
  });

  it("keeps a body exactly on the limit", async () => {
    expect(await readUpTo(stream([1, 2], [3, 4]), 4)).toEqual(Buffer.from([1, 2, 3, 4]));
  });

  it("gives up once the limit is passed", async () => {
    expect(await readUpTo(stream([1, 2], [3, 4, 5]), 4)).toBeNull();
  });

  it("returns null for no body", async () => {
    expect(await readUpTo(null, 8)).toBeNull();
  });
});
