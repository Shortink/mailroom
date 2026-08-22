import QRCode from "qrcode";
import { beginEnrolment } from "../actions";
import { EnrolForm } from "./EnrolForm";

export const dynamic = "force-dynamic";

export default async function EnrolPage() {
  const { secret, uri } = await beginEnrolment();
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });

  return <EnrolForm qr={qr} secret={secret} />;
}
