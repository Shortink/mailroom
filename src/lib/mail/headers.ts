// What the drawer shows, in this order. A message carries plenty more; these
// are the ones that say where it came from and who checked it.
const SHOWN = [
  "Return-Path",
  "Message-ID",
  "Received-SPF",
  "DKIM-Signature",
  "Authentication-Results",
  "List-ID",
  "List-Unsubscribe",
];

export interface Header {
  key: string;
  value: string;
}

export function shownHeaders(raw: unknown): Header[] {
  if (!raw || typeof raw !== "object") return [];

  // Senders and parsers disagree about capitalisation, so compare in lowercase.
  const carried = new Map(
    Object.entries(raw as Record<string, unknown>).map(([key, value]) => [
      key.toLowerCase(),
      value,
    ]),
  );

  return SHOWN.flatMap((name) => {
    const value = carried.get(name.toLowerCase());
    return typeof value === "string" && value ? [{ key: name, value }] : [];
  });
}
