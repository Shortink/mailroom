import { describe, expect, it } from "vitest";
import { authentication } from "../../src/lib/mail/auth";

const inbound = (dmarc: string | null) => authentication({ direction: "inbound", dmarc });

describe("authentication", () => {
  it("passes a message where all three checks passed", () => {
    const out = inbound("mx.example.com; dkim=pass header.i=@x.test; spf=pass; dmarc=pass");
    expect(out.verdict).toBe("pass");
    expect(out.detail).toBe("spf pass · dkim pass · dmarc pass");
  });

  it("fails a message where one check failed", () => {
    const out = inbound("mx.example.com; dkim=pass; spf=fail; dmarc=quarantine");
    expect(out.verdict).toBe("fail");
    expect(out.detail).toContain("spf fail");
  });

  it("treats a softfail as a fail", () => {
    expect(inbound("spf=softfail; dkim=pass; dmarc=pass").verdict).toBe("fail");
  });

  it("does not claim a pass when a check is missing", () => {
    // A hop that reported only spf says nothing about the other two.
    expect(inbound("mx.example.com; spf=pass").verdict).toBe("unknown");
  });

  it("does not read a dmarc policy of none as a failure", () => {
    const out = inbound("spf=pass; dkim=pass; dmarc=none");
    expect(out.verdict).toBe("unknown");
    expect(out.detail).toContain("dmarc none");
  });

  it("says so when the message carried no results at all", () => {
    expect(inbound(null)).toEqual({
      verdict: "unknown",
      detail: "no authentication results",
    });
  });

  it("marks the operator's own mail as its own", () => {
    expect(authentication({ direction: "outbound", dmarc: null }).verdict).toBe("own");
  });
});
