import { describe, expect, it } from "vitest";
import { referencedCids } from "../../src/lib/mail/parts";

describe("referencedCids", () => {
  it("finds the ids a body draws", () => {
    const html = '<p><img src="cid:logo@x"> and <img src=\'cid:sig@x\'></p>';
    expect(referencedCids(html)).toEqual(new Set(["logo@x", "sig@x"]));
  });

  it("finds one used from a style", () => {
    expect(referencedCids('<div style="background:url(cid:bg@x)">')).toEqual(new Set(["bg@x"]));
  });

  it("is empty for no body", () => {
    expect(referencedCids(null).size).toBe(0);
  });
});
