import { describe, expect, it } from "vitest";
import { textIsEnough } from "../../src/lib/mail/body";

describe("textIsEnough", () => {
  it("accepts a message somebody simply typed", () => {
    expect(textIsEnough("<div>hello this is me</div>", "hello this is me")).toBe(true);
  });

  it("accepts line breaks and paragraphs", () => {
    expect(textIsEnough("<div>one<br>two</div><p>three</p>", "one\ntwo\n\nthree")).toBe(true);
  });

  it("reads entities as the characters they stand for", () => {
    expect(textIsEnough("<div>tea &amp; toast</div>", "tea & toast")).toBe(true);
  });

  it("keeps html when there is a link to lose", () => {
    expect(
      textIsEnough('<div>reset it <a href="https://example.test">here</a></div>', "reset it here"),
    ).toBe(false);
  });

  it("keeps html for an image", () => {
    expect(textIsEnough('<div><img src="https://example.test/a.png"> hi</div>', "hi")).toBe(false);
  });

  it("keeps html for a table", () => {
    expect(textIsEnough("<table><tr><td>total</td></tr></table>", "total")).toBe(false);
  });

  it("keeps html when a tag is styled", () => {
    expect(
      textIsEnough('<div><span style="color:#c00">urgent</span></div>', "urgent"),
    ).toBe(false);
  });

  it("keeps html when the words differ", () => {
    expect(
      textIsEnough("<div>the full message</div>", "This email requires an HTML reader."),
    ).toBe(false);
  });

  it("keeps html when there is no text part", () => {
    expect(textIsEnough("<div>hello</div>", null)).toBe(false);
    expect(textIsEnough("<div>hello</div>", "   ")).toBe(false);
  });

  it("keeps html for formatting the text cannot carry", () => {
    expect(textIsEnough("<div><strong>hello</strong></div>", "hello")).toBe(false);
    expect(textIsEnough("<ul><li>one</li></ul>", "one")).toBe(false);
    expect(textIsEnough("<blockquote>quoted</blockquote>", "quoted")).toBe(false);
  });
});
