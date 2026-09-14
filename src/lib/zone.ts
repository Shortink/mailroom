import { cookies } from "next/headers";

// The cookie is reader-controlled and an unknown zone makes Intl throw, so
// trust it only once it formats.
function usable(zone: string) {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

// UTC until the browser says otherwise.
export async function readerZone() {
  const zone = (await cookies()).get("tz")?.value;
  return zone && usable(zone) ? zone : "UTC";
}
