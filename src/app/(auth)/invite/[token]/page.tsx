import { notFound } from "next/navigation";
import { inviteIsValid } from "@/lib/auth/invites";
import { InviteForm } from "./InviteForm";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await inviteIsValid(token))) notFound();
  return <InviteForm token={token} />;
}
