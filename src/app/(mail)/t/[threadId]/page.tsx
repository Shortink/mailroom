import { notFound } from "next/navigation";
import { MarkRead } from "@/components/mail/MarkRead";
import { MessageThread, type ThreadMessage } from "@/components/mail/MessageThread";
import { QuickReply, ThreadActions } from "@/components/mail/ThreadActions";
import { requireUser } from "@/lib/auth/require";
import { formatSize, formatStamp, snippet } from "@/lib/format";
import { signAttachmentUrl } from "@/lib/mail/attachmentLink";
import { addressColor, initials } from "@/lib/mail/identity";
import { referencedCids } from "@/lib/mail/parts";
import { loadThread } from "@/lib/mail/queries";
import { sanitizeEmailHtml } from "@/lib/mail/sanitize";
import { getStorage } from "@/lib/storage";

export default async function ThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  await requireUser();
  const { threadId } = await params;

  const thread = await loadThread(threadId);
  if (!thread) notFound();

  const unread = thread.messages.some(
    (message) => message.direction === "inbound" && message.readAt === null,
  );

  const storage = getStorage();
  // The download list below sits in the page itself, so it needs no signature.
  const cids = Object.fromEntries(
    thread.attachments
      .filter((file) => file.contentId)
      .map((file) => [
        file.contentId!,
        signAttachmentUrl(storage.url(file.storageKey), file.storageKey),
      ]),
  );

  const messages: ThreadMessage[] = thread.messages.map((message) => {
    const outbound = message.direction === "outbound";
    const drawn = referencedCids(message.htmlBody);

    return {
      id: message.id,
      name: outbound ? "You" : (message.fromName ?? message.fromAddress ?? "Unknown sender"),
      address: message.fromAddress ?? "",
      to: (outbound ? message.to[0] : message.deliveredTo) ?? "",
      time: formatStamp(message.receivedAt),
      snippet: snippet(message.textBody),
      initials: outbound ? "You" : initials(message.fromName, message.fromAddress),
      html: message.htmlBody ? sanitizeEmailHtml(message.htmlBody, { cids }) : null,
      text: message.textBody,
      files: thread.attachments
        .filter((file) => file.messageId === message.id)
        .filter((file) => !(file.contentId && drawn.has(file.contentId)))
        .map((file) => ({
          id: file.id,
          name: file.filename,
          size: formatSize(file.sizeBytes),
          url: storage.url(file.storageKey),
        })),
    };
  });

  // Reply from the address the mail was delivered to, back to whoever last wrote.
  const inbound = thread.messages.filter((message) => message.direction === "inbound");
  const latest = inbound.at(-1) ?? thread.messages.at(-1);
  const replyFrom = latest?.deliveredTo ?? "";
  const replyTo = latest?.fromAddress ?? "";

  // Whoever wrote last owns the reply box, so a sender new to an established
  // thread is worth naming before an answer goes back to them.
  const earlier = new Set(inbound.slice(0, -1).map((message) => message.fromAddress));
  const newSender = inbound.length > 1 && Boolean(replyTo) && !earlier.has(replyTo);
  const replySubject = thread.subject.startsWith("Re: ") ? thread.subject : `Re: ${thread.subject}`;

  const people = [...new Set(inbound.map((message) => message.fromName ?? message.fromAddress))]
    .filter(Boolean)
    .slice(0, 2) as string[];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-8 py-6 scroll-clean">
      <MarkRead threadId={thread.id} unread={unread} />

      <div className="flex flex-none flex-wrap items-center gap-2">
        {replyFrom && (
          <span className="flex items-center gap-2 rounded-full bg-chip px-2.5 py-1 text-[11.5px]">
            <span
              className="size-[7px] rounded-full"
              style={{ background: addressColor(replyFrom) }}
            />
            <span className="font-mono">{replyFrom}</span>
          </span>
        )}
        <span className="font-mono text-[11px] text-ink3">
          {thread.messages.length} {thread.messages.length === 1 ? "message" : "messages"}
        </span>
        {newSender && (
          <span className="rounded-full bg-chip px-2.5 py-1 text-[11.5px] text-ink2">
            First message here from <span className="font-mono">{replyTo}</span>. A reply goes to
            them.
          </span>
        )}
      </div>

      <h1 className="max-w-[720px] flex-none text-[27px] leading-[1.2] font-semibold tracking-[-0.02em] text-pretty">
        {thread.subject || "(no subject)"}
      </h1>

      <div className="flex flex-none items-center gap-3">
        <span className="flex flex-none -space-x-2.5">
          {people.map((person) => (
            <span
              key={person}
              className="flex size-[30px] items-center justify-center rounded-full border-2 border-bg text-[10.5px] font-semibold text-white"
              style={{ background: "var(--brand)" }}
            >
              {initials(person, null)}
            </span>
          ))}
        </span>
        <span className="truncate text-[13px] text-ink2">
          {people.length > 0 ? `${people.join(", ")} and you` : "You"}
        </span>

        <ThreadActions
          threadId={thread.id}
          archived={thread.archived}
          replyFrom={replyFrom}
          replyTo={replyTo}
          replySubject={replySubject}
        />
      </div>

      <MessageThread messages={messages} />

      {replyTo && (
        <QuickReply
          threadId={thread.id}
          replyFrom={replyFrom}
          replyTo={replyTo}
          replySubject={replySubject}
          initials="You"
        />
      )}
    </div>
  );
}
