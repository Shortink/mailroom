import { requireUser } from "@/lib/auth/require";
import { listHidden } from "@/lib/mail/addresses";
import { listAllowedSenders, loadsImages } from "@/lib/mail/images";
import { listInboxes } from "@/lib/mail/queries";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const userId = await requireUser();
  const [{ named }, hidden, imageSenders, loadImages] = await Promise.all([
    listInboxes(),
    listHidden(),
    listAllowedSenders(),
    loadsImages(userId),
  ]);

  return (
    <SettingsClient
      appUrl={process.env.APP_URL ?? ""}
      accounts={named}
      hidden={hidden}
      imageSenders={imageSenders}
      loadImages={loadImages}
    />
  );
}
