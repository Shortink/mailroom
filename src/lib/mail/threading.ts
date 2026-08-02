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
  receivedAt: Date;
}

export interface Candidates {
  byMessageId: { messageId: string; threadId: string }[];
  bySubject: { threadId: string; participants: string[]; lastMessageAt: Date }[];
}

export type Decision =
  | { action: "attach"; threadId: string }
  | { action: "merge"; threadId: string; absorb: string[] }
  | { action: "create" };

export function resolveThread(
  incoming: Incoming,
  candidates: Candidates,
  options?: { oldest?: (threadIds: string[]) => string },
): Decision {
  const referenced = new Set(
    [incoming.inReplyTo, ...incoming.references].filter((id): id is string => Boolean(id)),
  );

  const threadIds = [
    ...new Set(
      candidates.byMessageId
        .filter((candidate) => referenced.has(candidate.messageId))
        .map((candidate) => candidate.threadId),
    ),
  ];

  if (threadIds.length === 1) {
    return { action: "attach", threadId: threadIds[0] };
  }

  if (threadIds.length > 1) {
    const survivor = options?.oldest?.(threadIds) ?? threadIds[0];
    return {
      action: "merge",
      threadId: survivor,
      absorb: threadIds.filter((id) => id !== survivor),
    };
  }

  const subject = normalizeSubject(incoming.subject);
  if (!subject) return { action: "create" };

  const match = candidates.bySubject.find(
    (candidate) =>
      candidate.participants.some((participant) => incoming.participants.includes(participant)) &&
      incoming.receivedAt.getTime() - candidate.lastMessageAt.getTime() < SUBJECT_MATCH_WINDOW_MS,
  );

  return match ? { action: "attach", threadId: match.threadId } : { action: "create" };
}
