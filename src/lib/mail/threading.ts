// "Re:", "Fwd:", "FW:", and the "Re[2]:" form some clients emit, repeated.
const REPLY_PREFIX = /^\s*(?:(?:re|fwd?|fw)\s*(?:\[\d+\])?\s*:\s*)+/i;

const SUBJECT_MATCH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function normalizeSubject(subject: string) {
  return subject.replace(REPLY_PREFIX, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export interface Incoming {
  inReplyTo: string | null;
  references: string[];
  subject: string;
  participants: string[];
  domain: string;
  receivedAt: Date;
}

export interface Candidates {
  byMessageId: { messageId: string; threadId: string; participants: string[] }[];
  bySubject: { threadId: string; participants: string[]; lastMessageAt: Date }[];
}

export type Decision = { action: "attach"; threadId: string } | { action: "create" };

// Mail is received catch-all, so the operator's own addresses sit on every
// thread and say nothing about where a message belongs. Only the addresses on
// the other side of the conversation are evidence.
function counterparties(participants: string[], domain: string) {
  const suffix = `@${domain.toLowerCase()}`;
  return participants
    .map((address) => address.toLowerCase())
    .filter((address) => !address.endsWith(suffix));
}

export function resolveThread(
  incoming: Incoming,
  candidates: Candidates,
  options?: { oldest?: (threadIds: string[]) => string },
): Decision {
  // Without the delivered-to domain there is no way to tell an operator
  // address from a stranger's, so nothing can be matched safely.
  if (!incoming.domain) return { action: "create" };

  const referenced = new Set(
    [incoming.inReplyTo, ...incoming.references].filter((id): id is string => Boolean(id)),
  );

  // A Message-ID is not a secret: it travels in every forwarded copy and every
  // bounce, so a header match alone would let anyone who has seen one plant a
  // message in that thread.
  const sender = counterparties(incoming.participants, incoming.domain);
  const shared = (participants: string[]) =>
    counterparties(participants, incoming.domain).some((address) => sender.includes(address));

  const threadIds = [
    ...new Set(
      candidates.byMessageId
        .filter((candidate) => referenced.has(candidate.messageId))
        .filter((candidate) => shared(candidate.participants))
        .map((candidate) => candidate.threadId),
    ),
  ];

  if (threadIds.length === 1) {
    return { action: "attach", threadId: threadIds[0] };
  }

  // Headers reaching several threads join the oldest of them. Folding the rest
  // into it would mean deleting thread rows on the strength of a header the
  // sender controls.
  if (threadIds.length > 1) {
    return { action: "attach", threadId: options?.oldest?.(threadIds) ?? threadIds[0] };
  }

  const subject = normalizeSubject(incoming.subject);
  if (!subject) return { action: "create" };

  const match = candidates.bySubject.find(
    (candidate) =>
      shared(candidate.participants) &&
      incoming.receivedAt.getTime() - candidate.lastMessageAt.getTime() < SUBJECT_MATCH_WINDOW_MS,
  );

  return match ? { action: "attach", threadId: match.threadId } : { action: "create" };
}
