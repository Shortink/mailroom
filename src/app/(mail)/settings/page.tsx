import { requireViewer } from "@/lib/auth/require";
import { listPeople } from "@/lib/auth/people";
import { loadViewer } from "@/lib/auth/viewer";
import { listHidden } from "@/lib/mail/addresses";
import { listAllowedSenders, loadsImages } from "@/lib/mail/images";
import { listInboxes } from "@/lib/mail/queries";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const viewer = await requireViewer();
  const owner = viewer.role === "owner";

  // The switcher narrows the mail, not Settings: every address the viewer has
  // is listed here, whichever one they are looking at.
  const everything = (await loadViewer(viewer.userId, "all")) ?? viewer;
  const [{ named }, loadImages] = await Promise.all([listInboxes(everything), loadsImages(viewer.userId)]);
  const [hidden, imageSenders, people] = owner
    ? await Promise.all([listHidden(), listAllowedSenders(), listPeople()])
    : [[], [], []];

  return (
    <SettingsClient
      appUrl={process.env.APP_URL ?? ""}
      owner={owner}
      accounts={named}
      hidden={hidden}
      imageSenders={imageSenders}
      loadImages={loadImages}
      people={people}
    />
  );
}
