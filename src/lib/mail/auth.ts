export type Verdict = "pass" | "fail" | "unknown" | "own";

export interface Authentication {
  verdict: Verdict;
  detail: string;
}

const CHECKS = ["spf", "dkim", "dmarc"] as const;

// Receiving writes Authentication-Results as it arrived. On the Cloudflare path
// that header is Cloudflare's own and was checked before the worker ran; on the
// Resend path it is whatever the sender's hop claimed. Neither is re-verified
// here, so a message with no results is reported as unknown rather than passed.
function results(header: string | null) {
  const found = new Map<string, string>();
  if (!header) return found;

  // Segments are separated by ";", and a segment can carry more than one pair
  // ("dkim=pass header.i=@x.test"), so only the first of each is the verdict.
  for (const segment of header.split(";")) {
    const [key, value] = segment.trim().split(" ")[0].split("=");
    const check = key?.toLowerCase();

    if (value && CHECKS.some((known) => known === check)) {
      found.set(check, value.toLowerCase());
    }
  }

  return found;
}

export function authentication(
  message: { direction: string; dmarc: string | null },
): Authentication {
  if (message.direction === "outbound") {
    return { verdict: "own", detail: "sent from this instance" };
  }

  const found = results(message.dmarc);
  if (found.size === 0) return { verdict: "unknown", detail: "no authentication results" };

  const detail = CHECKS.filter((check) => found.has(check))
    .map((check) => `${check} ${found.get(check)}`)
    .join(" · ");

  // A dmarc policy of none is the absence of a rule, not a failure, so only an
  // outright fail counts against the sender.
  const failed = [...found.values()].some((value) => value === "fail" || value === "softfail");
  if (failed) return { verdict: "fail", detail };

  const passed = CHECKS.every((check) => found.get(check) === "pass");
  return passed ? { verdict: "pass", detail } : { verdict: "unknown", detail };
}
