import { notFound } from "next/navigation";
import { MarkRead } from "@/components/mail/MarkRead";
import {
  MessageThread,
  type ThreadFile,
  type ThreadMessage,
} from "@/components/mail/MessageThread";
import { QuickReply, ThreadActions } from "@/components/mail/ThreadActions";
import { requireUser } from "@/lib/auth/require";
import { formatAgo, formatExact, formatSize, snippet } from "@/lib/format";
import { authentication } from "@/lib/mail/auth";
import { shownHeaders } from "@/lib/mail/headers";
import { addressColor, initials } from "@/lib/mail/identity";
import { hasQuotedReply, hasRemoteImages, referencedCids } from "@/lib/mail/parts";
import { loadThread } from "@/lib/mail/queries";
import { renderHtml } from "@/lib/mail/render";
import { getStorage } from "@/lib/storage";
import { readerZone } from "@/lib/zone";

// Only these types are served inline, so only these can show a thumbnail.
const DRAWABLE = ["image/png", "image/jpeg", "image/gif", "image/webp"];

function extension(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot + 1, dot + 6).toUpperCase() : "FILE";
}

export default async function ThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  await requireUser();
  const { threadId } = await params;

  const thread = await loadThread(threadId);
  if (!thread) notFound();

  const unread = thread.messages.some(
    (message) => message.direction === "inbound" && message.readAt === null,
  );

  const storage = getStorage();
  const zone = await readerZone();
  // Named once per render and admitted by each frame policy, so the height
  // reporter runs and nothing that arrived in a message does.
  const nonce = crypto.randomUUID();

  const messages: ThreadMessage[] = thread.messages.map((message) => {
    const outbound = message.direction === "outbound";
    const drawn = referencedCids(message.htmlBody);

    const files: ThreadFile[] = thread.attachments
      .filter((file) => file.messageId === message.id)
      .filter((file) => !(file.contentId && drawn.has(file.contentId)))
      .map((file) => ({
        id: file.id,
        name: file.filename,
        size: formatSize(file.sizeBytes),
        url: storage.url(file.storageKey),
        image: DRAWABLE.includes(file.contentType.split(";")[0].trim().toLowerCase()),
        extension: extension(file.filename),
      }));

    return {
      id: message.id,
      name: outbound ? "You" : (message.fromName ?? message.fromAddress ?? "Unknown sender"),
      address: outbound ? (message.deliveredTo ?? "") : (message.fromAddress ?? ""),
      to: (outbound ? message.to[0] : message.deliveredTo) ?? "",
      ago: formatAgo(message.receivedAt),
      exact: formatExact(message.receivedAt, zone),
      snippet: snippet(message.textBody),
      initials: outbound ? "You" : initials(message.fromName, message.fromAddress),
      outbound,
      auth: authentication(message),
      headers: shownHeaders(message.headers),
      html: message.htmlBody ? renderHtml(message.htmlBody, thread.attachments) : null,
      text: message.textBody,
      remoteImages: hasRemoteImages(message.htmlBody),
      quoted: hasQuotedReply(message.htmlBody),
      files,
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

  const count = `${thread.messages.length} ${thread.messages.length === 1 ? "message" : "messages"}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 scroll-clean">
      <MarkRead threadId={thread.id} unread={unread} />

      {/* Pinned so a long thread keeps its actions in reach. The negative
          margins carry it across the padding the column scrolls inside. */}
      <div className="sticky top-0 z-10 -mx-8 flex flex-none items-center gap-4 border-b border-line bg-panel2 px-8 py-[15px] backdrop-blur-[20px]">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {replyFrom && (
              <span
                className="size-[7px] flex-none rounded-full"
                style={{ background: addressColor(replyFrom) }}
              />
            )}
            <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em]">
              {thread.subject || "(no subject)"}
            </h1>
          </div>
          <p className="mt-0.5 truncate font-mono text-[10px] text-ink3">
            {count}
            {replyFrom && ` · ${replyFrom}`}
          </p>
        </div>

        <ThreadActions
          threadId={thread.id}
          archived={thread.archived}
          replyFrom={replyFrom}
          replyTo={replyTo}
          replySubject={replySubject}
        />
      </div>

      <div className="flex flex-none flex-col gap-4 py-5">
        {newSender && (
          <p className="flex-none rounded-full bg-chip px-2.5 py-1 text-[11.5px] text-ink2">
            First message here from <span className="font-mono">{replyTo}</span>. A reply goes to
            them.
          </p>
        )}

        <MessageThread messages={messages} nonce={nonce} />

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
    </div>
  );
}
