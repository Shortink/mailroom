import { describe, expect, it } from "vitest";
import { snippet } from "../../src/lib/format";

describe("snippet", () => {
  it("collapses runs of whitespace onto one line", () => {
    expect(snippet("first line\n\n  second   line")).toBe("first line second line");
  });

  it("truncates past the limit and marks it", () => {
    expect(snippet("abcdefghij", 4)).toBe("abcd…");
  });

  it("leaves text at the limit alone", () => {
    expect(snippet("abcd", 4)).toBe("abcd");
  });

  it("gives an empty string for nothing to show", () => {
    expect(snippet(null)).toBe("");
    expect(snippet("   ")).toBe("");
  });
});
