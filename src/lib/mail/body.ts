// Tags that carry nothing a typed sentence and its line breaks do not.
const BARE_TAGS = new Set(["div", "p", "br", "span"]);

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decode(value: string) {
  return value.replace(/&(#\d+|[a-z]+);/gi, (whole, name: string) => {
    const named = ENTITIES[name.toLowerCase()];
    if (named) return named;

    const numeric = /^#(\d+)$/.exec(name);
    return numeric ? String.fromCodePoint(Number(numeric[1])) : whole;
  });
}

const flat = (value: string) => value.replace(/\s+/g, " ").trim();

// Whether the text part carries everything the html part does. For a typed
// message the html adds only a wrapper, and the text can take the interface's
// colours where html has to be framed off on its own white ground.
export function textIsEnough(html: string, text: string | null) {
  if (!text?.trim()) return false;

  for (const match of html.matchAll(/<\s*\/?\s*([a-z][a-z0-9]*)([^>]*)>/gi)) {
    const [, name, attributes] = match;
    if (!BARE_TAGS.has(name.toLowerCase())) return false;

    // Attributes survive sanitising only when they style something, so any that
    // are left mean the html is doing more than holding the words.
    if (attributes.replace(/\/$/, "").trim() !== "") return false;
  }

  return flat(decode(html.replace(/<[^>]*>/g, " "))) === flat(text);
}
