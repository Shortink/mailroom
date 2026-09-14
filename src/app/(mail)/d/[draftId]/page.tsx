import { notFound } from "next/navigation";
import { DraftPreview } from "@/components/mail/DraftPreview";
import { requireUser } from "@/lib/auth/require";
import { formatStamp } from "@/lib/format";
import { loadDraft } from "@/lib/mail/drafts";
import { readerZone } from "@/lib/zone";

export default async function DraftPage({ params }: { params: Promise<{ draftId: string }> }) {
  await requireUser();
  const { draftId } = await params;

  const draft = await loadDraft(draftId);
  if (!draft) notFound();

  return (
    <DraftPreview
      draft={{
        id: draft.id,
        threadId: draft.threadId ?? undefined,
        from: draft.fromAddress,
        to: draft.to,
        subject: draft.subject,
        body: draft.body,
      }}
      saved={formatStamp(draft.updatedAt, await readerZone())}
    />
  );
}
