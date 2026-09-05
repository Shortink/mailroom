// Per-address identity hues, kept warm so they never read as the accent.
export const SWATCH_HUES = [320, 42, 88, 18, 112, 258];

export function colorForHue(hue: number) {
  return `oklch(0.74 0.14 ${hue})`;
}

// An address keeps its colour across restarts, so the hash stands in until a
// colour is chosen in its settings.
export function hueFor(address: string) {
  let hash = 0;
  for (let i = 0; i < address.length; i++) hash = (hash * 31 + address.charCodeAt(i)) >>> 0;
  return SWATCH_HUES[hash % SWATCH_HUES.length];
}

export function addressColor(address: string, hue?: number | null, named = true) {
  if (!named) return "var(--ink3)";
  return colorForHue(hue ?? hueFor(address));
}

export function localPart(address: string) {
  return address.split("@")[0];
}

export function initials(name: string | null, address: string | null) {
  const source = name?.trim() || localPart(address ?? "") || "?";
  const words = source.split(/[\s._-]+/).filter(Boolean);

  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}
