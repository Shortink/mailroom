import { DraftList, type DraftItem } from "@/components/mail/DraftList";
import { requireViewer } from "@/lib/auth/require";
import { formatWhen, snippet } from "@/lib/format";
import { listDrafts } from "@/lib/mail/drafts";
import { readerZone } from "@/lib/zone";

export async function DraftListPane() {
  // Rendered from a parallel route slot, which the layout above does not gate.
  const viewer = await requireViewer();

  const drafts = await listDrafts(viewer);
  const zone = await readerZone();

  const items: DraftItem[] = drafts.map((draft) => ({
    id: draft.id,
    from: draft.from,
    to: draft.to,
    subject: draft.subject,
    preview: snippet(draft.body),
    time: formatWhen(draft.updatedAt, zone),
    isReply: draft.threadId !== null,
  }));

  return <DraftList items={items} />;
}
