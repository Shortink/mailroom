const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const short = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

// Mail lists show a time for today, a weekday for this week, and a date for
// anything older.
export function formatWhen(value: Date, now = new Date()) {
  const age = now.getTime() - value.getTime();
  const sameDay = value.toDateString() === now.toDateString();

  if (sameDay) return time.format(value);
  if (age < 6 * 24 * 60 * 60 * 1000) return weekday.format(value);
  return short.format(value);
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
