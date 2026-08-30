import { describe, expect, it } from "vitest";
import {
  normalizeSubject,
  resolveThread,
  type Candidates,
  type Incoming,
} from "../../src/lib/mail/threading";

const now = new Date("2026-09-05T12:00:00Z");

function incoming(overrides: Partial<Incoming> = {}): Incoming {
  return {
    inReplyTo: null,
    references: [],
    subject: "Invoice",
    participants: ["a@x.test"],
    receivedAt: now,
    ...overrides,
  };
}

function candidates(overrides: Partial<Candidates> = {}): Candidates {
  return { byMessageId: [], bySubject: [], ...overrides };
}

describe("normalizeSubject", () => {
  it.each([
    ["Re: Hello", "hello"],
    ["Re: Re: Fwd: Hello", "hello"],
    ["RE: FW:  spaced   out ", "spaced out"],
    ["fwd: Fwd: FWD: deep", "deep"],
    ["Re[2]: numbered", "numbered"],
    ["No prefix", "no prefix"],
    ["", ""],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeSubject(input)).toBe(expected);
  });

  it("does not strip a word that merely starts with re", () => {
    expect(normalizeSubject("Rebuilding the index")).toBe("rebuilding the index");
  });

  it("does not strip a colon that is not a reply prefix", () => {
    expect(normalizeSubject("Alert: disk full")).toBe("alert: disk full");
  });
});

describe("resolveThread", () => {
  it("attaches on an in-reply-to match", () => {
    const result = resolveThread(
      incoming({ inReplyTo: "<a@x>" }),
      candidates({ byMessageId: [{ messageId: "<a@x>", threadId: "T1", participants: ["a@x.test"] }] }),
    );
    expect(result).toEqual({ action: "attach", threadId: "T1" });
  });

  it("attaches on any references entry, not just the last", () => {
    const result = resolveThread(
      incoming({ references: ["<z@x>", "<b@x>"] }),
      candidates({ byMessageId: [{ messageId: "<b@x>", threadId: "T2", participants: ["a@x.test"] }] }),
    );
    expect(result).toEqual({ action: "attach", threadId: "T2" });
  });

  it("prefers a header match over a competing subject match", () => {
    const result = resolveThread(
      incoming({ inReplyTo: "<a@x>" }),
      candidates({
        byMessageId: [{ messageId: "<a@x>", threadId: "T-header", participants: ["a@x.test"] }],
        bySubject: [{ threadId: "T-subject", participants: ["a@x.test"], lastMessageAt: now }],
      }),
    );
    expect(result).toEqual({ action: "attach", threadId: "T-header" });
  });

  it("merges into the oldest thread when headers span two", () => {
    const result = resolveThread(
      incoming({ inReplyTo: "<a@x>", references: ["<b@x>"] }),
      candidates({
        byMessageId: [
          { messageId: "<a@x>", threadId: "T-new", participants: ["a@x.test"] },
          { messageId: "<b@x>", threadId: "T-old", participants: ["a@x.test"] },
        ],
      }),
      { oldest: (ids) => (ids.includes("T-old") ? "T-old" : ids[0]) },
    );
    expect(result).toEqual({ action: "merge", threadId: "T-old", absorb: ["T-new"] });
  });

  it("does not merge when several ids point at one thread", () => {
    const result = resolveThread(
      incoming({ inReplyTo: "<a@x>", references: ["<b@x>"] }),
      candidates({
        byMessageId: [
          { messageId: "<a@x>", threadId: "T1", participants: ["a@x.test"] },
          { messageId: "<b@x>", threadId: "T1", participants: ["a@x.test"] },
        ],
      }),
    );
    expect(result).toEqual({ action: "attach", threadId: "T1" });
  });

  it("falls back to subject when participants overlap", () => {
    const result = resolveThread(
      incoming({ subject: "Re: Invoice" }),
      candidates({
        bySubject: [
          {
            threadId: "T3",
            participants: ["a@x.test", "b@x.test"],
            lastMessageAt: new Date("2026-09-01T00:00:00Z"),
          },
        ],
      }),
    );
    expect(result).toEqual({ action: "attach", threadId: "T3" });
  });

  it("ignores a subject match with no shared participant", () => {
    const result = resolveThread(
      incoming(),
      candidates({
        bySubject: [{ threadId: "T4", participants: ["c@x.test"], lastMessageAt: now }],
      }),
    );
    expect(result).toEqual({ action: "create" });
  });

  it("ignores a subject match older than the window", () => {
    const result = resolveThread(
      incoming(),
      candidates({
        bySubject: [
          {
            threadId: "T5",
            participants: ["a@x.test"],
            lastMessageAt: new Date("2026-01-01T00:00:00Z"),
          },
        ],
      }),
    );
    expect(result).toEqual({ action: "create" });
  });

  it("never groups messages by an empty subject", () => {
    const result = resolveThread(
      incoming({ subject: "Re: " }),
      candidates({
        bySubject: [{ threadId: "T6", participants: ["a@x.test"], lastMessageAt: now }],
      }),
    );
    expect(result).toEqual({ action: "create" });
  });

  it("creates a thread when nothing matches", () => {
    expect(resolveThread(incoming(), candidates())).toEqual({ action: "create" });
  });

  it("refuses a header match from someone outside the thread", () => {
    const result = resolveThread(
      incoming({ inReplyTo: "<a@x>", participants: ["stranger@evil.test"] }),
      candidates({
        byMessageId: [{ messageId: "<a@x>", threadId: "T1", participants: ["a@x.test"] }],
      }),
    );
    expect(result).toEqual({ action: "create" });
  });

  it("refuses a forced merge from someone outside both threads", () => {
    const result = resolveThread(
      incoming({ inReplyTo: "<a@x>", references: ["<b@x>"], participants: ["stranger@evil.test"] }),
      candidates({
        byMessageId: [
          { messageId: "<a@x>", threadId: "T-one", participants: ["a@x.test"] },
          { messageId: "<b@x>", threadId: "T-two", participants: ["b@x.test"] },
        ],
      }),
    );
    expect(result).toEqual({ action: "create" });
  });

  it("still merges when the sender belongs to both threads", () => {
    const result = resolveThread(
      incoming({ inReplyTo: "<a@x>", references: ["<b@x>"] }),
      candidates({
        byMessageId: [
          { messageId: "<a@x>", threadId: "T-new", participants: ["a@x.test"] },
          { messageId: "<b@x>", threadId: "T-old", participants: ["a@x.test"] },
        ],
      }),
      { oldest: (ids) => (ids.includes("T-old") ? "T-old" : ids[0]) },
    );
    expect(result).toEqual({ action: "merge", threadId: "T-old", absorb: ["T-new"] });
  });

  it("ignores header ids that match nothing", () => {
    const result = resolveThread(
      incoming({ inReplyTo: "<unknown@x>" }),
      candidates({ byMessageId: [{ messageId: "<other@x>", threadId: "T7", participants: ["a@x.test"] }] }),
    );
    expect(result).toEqual({ action: "create" });
  });
});
