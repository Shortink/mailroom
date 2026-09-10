import { DraftList, type DraftItem } from "@/components/mail/DraftList";
import { requireUser } from "@/lib/auth/require";
import { formatWhen, snippet } from "@/lib/format";
import { listDrafts } from "@/lib/mail/drafts";

export async function DraftListPane() {
  // Rendered from a parallel route slot, which the layout above does not gate.
  await requireUser();

  const drafts = await listDrafts();

  const items: DraftItem[] = drafts.map((draft) => ({
    id: draft.id,
    from: draft.from,
    to: draft.to,
    subject: draft.subject,
    preview: snippet(draft.body),
    time: formatWhen(draft.updatedAt),
    isReply: draft.threadId !== null,
  }));

  return <DraftList items={items} />;
}
