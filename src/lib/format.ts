// The server runs in UTC, so the zone comes from the reader instead.
// Formatters are cached because a list renders dozens of rows and
// Intl.DateTimeFormat is slow to build.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(zone: string, key: string, options: Intl.DateTimeFormatOptions) {
  const id = `${key}:${zone}`;
  let made = formatters.get(id);

  if (!made) {
    made = new Intl.DateTimeFormat("en-GB", { ...options, timeZone: zone });
    formatters.set(id, made);
  }

  return made;
}

export function formatWhen(value: Date, zone: string, now = new Date()) {
  const age = now.getTime() - value.getTime();
  const day = formatter(zone, "day", { day: "numeric", month: "short", year: "numeric" });

  if (day.format(value) === day.format(now)) {
    return formatter(zone, "time", { hour: "2-digit", minute: "2-digit" }).format(value);
  }

  if (age < 6 * 24 * 60 * 60 * 1000) {
    return formatter(zone, "weekday", { weekday: "short" }).format(value);
  }

  return formatter(zone, "short", { day: "numeric", month: "short" }).format(value);
}

export function formatClock(value: Date, zone: string) {
  return formatter(zone, "time", { hour: "2-digit", minute: "2-digit" }).format(value);
}

// Dates here can be years old, so this one spells out the year.
export function formatDay(value: Date, zone: string) {
  return formatter(zone, "day", { day: "numeric", month: "short", year: "numeric" }).format(value);
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Message headers carry the full day and time, unlike the list's relative form.
export function formatStamp(value: Date, zone: string) {
  return formatter(zone, "stamp", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

// Body text shown under a subject line: one line, no run-on whitespace.
export function snippet(text: string | null, max = 120) {
  if (!text) return "";

  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max) + "…" : flat;
}

const ago = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

const STEPS = [
  ["minute", 60],
  ["hour", 60],
  ["day", 24],
  ["month", 30],
  ["year", 12],
] as const;

// How long ago needs no zone: it is a duration, not a point in time.
export function formatAgo(value: Date, now = new Date()) {
  let amount = (value.getTime() - now.getTime()) / 1000;
  let unit: Intl.RelativeTimeFormatUnit = "second";

  for (const [next, size] of STEPS) {
    if (Math.abs(amount) < size) break;
    amount /= size;
    unit = next;
  }

  return ago.format(Math.round(amount), unit);
}

// Expanded messages say exactly when, down to the second and the named zone.
export function formatExact(value: Date, zone: string) {
  return formatter(zone, "exact", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(value);
}
