import { describe, expect, it } from "vitest";
import { hasRemoteImages, referencedCids } from "../../src/lib/mail/parts";

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

describe("hasRemoteImages", () => {
  it("sees an image that would fetch", () => {
    expect(hasRemoteImages('<p><img src="https://x.test/logo.png"></p>')).toBe(true);
    expect(hasRemoteImages("<img src='http://x.test/a.gif'>")).toBe(true);
  });

  it("ignores inline and data images", () => {
    expect(hasRemoteImages('<img src="cid:logo@x">')).toBe(false);
    expect(hasRemoteImages('<img src="data:image/png;base64,AAAA">')).toBe(false);
  });

  it("is false for no body", () => {
    expect(hasRemoteImages(null)).toBe(false);
  });
});
