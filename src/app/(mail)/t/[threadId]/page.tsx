import Link from "next/link";
import { notFound } from "next/navigation";
import { BackIcon, DocIcon } from "@/components/icons";
import { MessageBody } from "@/components/MessageBody";
import { formatSize, formatWhen } from "@/lib/format";
import { loadThread, markThreadRead } from "@/lib/mail/queries";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const thread = await loadThread(threadId);
  if (!thread) notFound();

  await markThreadRead(threadId);

  const storage = getStorage();
  const cids = Object.fromEntries(
    thread.attachments
      .filter((file) => file.contentId)
      .map((file) => [file.contentId!, storage.url(file.storageKey)]),
  );

  const participants = [...new Set(thread.participants)].join(", ");

  return (
    <>
      <div className="flex h-11 flex-none items-center gap-2.5 border-b border-rule px-3.5">
        <Link
          href="/"
          className="flex size-[26px] items-center justify-center rounded-md border border-rule text-ink-2 transition-colors hover:bg-hover"
          aria-label="Back to inbox"
        >
          <BackIcon className="size-3.5" />
        </Link>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-none border-b border-rule px-5 pt-3.5 pb-3">
          <h1 className="mb-1 text-base font-semibold tracking-[-0.015em]">
            {thread.subject || "(no subject)"}
          </h1>
          <p className="text-xs text-ink-3">
            {participants} · {thread.messages.length}{thread.messages.length === 1 ? " message" : " messages"}
          </p>
        </div>

        <div className="flex-1 overflow-auto px-5">
          {thread.messages.map((message) => {
            const files = thread.attachments.filter(
              (file) => file.messageId === message.id && !file.contentId,
            );

            return (
              <article key={message.id} className="border-b border-rule py-3.5">
                <div className="mb-[7px] flex items-baseline gap-2">
                  <span className="text-[13px] font-semibold">
                    {message.direction === "outbound" ? "You" : (message.fromAddress ?? "Unknown")}
                  </span>
                  <span className="text-xs text-ink-3">
                    {message.direction === "outbound" ? message.fromAddress : message.deliveredTo}
                  </span>
                  <span className="ml-auto font-mono text-[11px] text-ink-3">
                    {formatWhen(message.receivedAt)}
                  </span>
                </div>

                <MessageBody html={message.htmlBody} text={message.textBody} cids={cids} />

                {files.map((file) => (
                  <a
                    key={file.id}
                    href={storage.url(file.storageKey)}
                    className="mt-2.5 inline-flex items-center gap-[7px] rounded-md border border-rule px-2.5 py-1.5 text-xs text-ink-2 transition-colors hover:bg-hover"
                  >
                    <DocIcon className="size-3.5" />
                    {file.filename}
                    <span className="font-mono text-[11px] text-ink-3">
                      {formatSize(file.sizeBytes)}
                    </span>
                  </a>
                ))}
              </article>
            );
          })}
        </div>
      </div>
    </>
  );
}
