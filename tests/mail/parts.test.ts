import { describe, expect, it } from "vitest";
import { hasQuotedReply, hasRemoteImages, quotedTextStart, referencedCids } from "../../src/lib/mail/parts";

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

describe("hasQuotedReply", () => {
  it("knows the three clients' markers", () => {
    expect(hasQuotedReply('<div class="gmail_quote">On x wrote:</div>')).toBe(true);
    expect(hasQuotedReply('<blockquote type="cite">old</blockquote>')).toBe(true);
    expect(hasQuotedReply('<div id="divRplyFwdMsg">From: x</div>')).toBe(true);
  });

  it("leaves an ordinary body alone", () => {
    expect(hasQuotedReply("<p>hi</p><blockquote>a quote, not a reply</blockquote>")).toBe(false);
    expect(hasQuotedReply(null)).toBe(false);
  });
});

describe("quotedTextStart", () => {
  it("finds the attribution line", () => {
    const text = "Thanks!\n\nOn Mon, Sep 7, 2026 at 11:40 AM Hasan wrote:\n> earlier";
    expect(text.slice(0, quotedTextStart(text)).trimEnd()).toBe("Thanks!");
  });

  it("finds a bare quote", () => {
    expect(quotedTextStart("ok\n> earlier\n> more")).toBe(2);
  });

  it("is -1 with nothing quoted, and 0 when it is all quote", () => {
    expect(quotedTextStart("just a message")).toBe(-1);
    expect(quotedTextStart("> all of it")).toBe(0);
    expect(quotedTextStart(null)).toBe(-1);
  });
});
