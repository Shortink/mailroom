import sanitizeHtml from "sanitize-html";

export interface SanitizeOptions {
  cids: Record<string, string>;
  allowRemoteImages?: boolean;
}

const ALLOWED_TAGS = [
  ...sanitizeHtml.defaults.allowedTags.filter((tag) => tag !== "iframe"),
  "img",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "span",
  "font",
  "center",
  // Most mail keeps its rules in a block and puts only classes on the markup,
  // so dropping this strips the message of its styling. It cannot execute: a
  // closing tag inside the CSS ends the element at the parser, and what
  // follows is sanitised as markup.
  "style",
];

const COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s,.%]+\)$/i, /^[a-z]+$/i];
const LENGTH = [/^-?\d+(\.\d+)?(px|em|rem|pt|%)?$/, /^auto$/];
const LENGTHS = [/^(-?\d+(\.\d+)?(px|em|rem|pt|%)?\s*){1,4}$/, /^auto$/];
// A width, a style and a colour, in any order.
const BORDER = [/^(\s*(\d+(\.\d+)?(px|em|rem|pt)?|none|solid|dashed|dotted|double|#[0-9a-f]{3,8}|rgba?\([\d\s,.%]+\)|[a-z]+))+$/i];

// A style can only affect the message it belongs to, since the frame is
// sandboxed. What is kept out is anything that could fetch: nothing here
// accepts a url().
const ALLOWED_STYLES: Record<string, RegExp[]> = {
  color: COLOR,
  "background-color": COLOR,
  "border-color": COLOR,
  border: BORDER,
  "border-top": BORDER,
  "border-right": BORDER,
  "border-bottom": BORDER,
  "border-left": BORDER,
  "border-width": LENGTHS,
  "border-style": [/^(none|solid|dashed|dotted|double)$/],
  "border-radius": LENGTHS,
  "border-collapse": [/^(collapse|separate)$/],
  "border-spacing": LENGTHS,
  display: [/^(block|inline|inline-block|table|table-row|table-cell|none)$/],
  width: LENGTH,
  height: LENGTH,
  "max-width": LENGTH,
  "min-width": LENGTH,
  "max-height": LENGTH,
  padding: LENGTHS,
  "padding-top": LENGTH,
  "padding-right": LENGTH,
  "padding-bottom": LENGTH,
  "padding-left": LENGTH,
  margin: LENGTHS,
  "margin-top": LENGTH,
  "margin-right": LENGTH,
  "margin-bottom": LENGTH,
  "margin-left": LENGTH,
  "text-align": [/^(left|right|center|justify)$/],
  "vertical-align": [/^(top|middle|bottom|baseline)$/],
  "font-family": [/^[\w\s,'"-]+$/],
  "font-size": [/^\d+(\.\d+)?(px|em|rem|pt|%)$/],
  "font-weight": [/^(bold|bolder|lighter|normal|[1-9]00)$/],
  "font-style": [/^(italic|normal)$/],
  "line-height": [/^\d+(\.\d+)?(px|em|rem|pt|%)?$/, /^normal$/],
  "letter-spacing": LENGTH,
  "text-decoration": [/^(underline|line-through|none)$/],
  "text-transform": [/^(uppercase|lowercase|capitalize|none)$/],
  "white-space": [/^(normal|nowrap|pre|pre-wrap|pre-line)$/],
  "word-break": [/^(normal|break-all|break-word)$/],
  opacity: [/^(0|1|0?\.\d+)$/],
};

// A browser reads an escape as the character it names, so u\rl( and url( are
// the same thing to it and only one looks like a fetch. Detection runs on a
// copy with the escapes resolved.
function resolveEscapes(css: string) {
  return css
    .replace(/\\([0-9a-f]{1,6})\s?/gi, (_, hex: string) => {
      const code = parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/\\(.)/g, "$1");
}

// A fetch is how a sender learns the message was opened. @import pulls a
// stylesheet, @font-face pulls a file, and url() does it from anywhere a value
// is allowed. Comments go first because they can hide all three.
function cleanCss(css: string) {
  const cleaned = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@import[^;]*;?/gi, "")
    .replace(/@font-face\s*\{[^}]*\}/gi, "")
    .replace(/[^;{}]*url\s*\([^)]*\)[^;{}]*;?/gi, "")
    .trim();

  // If anything still reads as a fetch it was written in a form the patterns
  // above missed, so drop the lot.
  return /url\s*\(|@import|@font-face/i.test(resolveEscapes(cleaned)) ? "" : cleaned;
}

export function sanitizeEmailHtml(html: string, options: SanitizeOptions) {
  const clean = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    // Keeps style content instead of dropping it, so the CSS can be cleaned
    // below. The warning is about the tag escaping its element, which the
    // parser does not allow.
    allowVulnerableTags: true,
    nonTextTags: ["script", "textarea", "option"],
    allowedAttributes: {
      "*": ["style", "class", "align", "valign", "width", "height", "bgcolor", "dir", "lang"],
      a: ["href", "target", "rel"],
      img: ["src", "alt", "width", "height"],
      table: ["border", "cellpadding", "cellspacing", "role"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
      font: ["color", "face", "size"],
      // What marks a quoted reply, so it can be folded.
      blockquote: ["type"],
      div: ["id"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedStyles: { "*": ALLOWED_STYLES },
    allowedSchemesByTag: { img: ["http", "https", "cid"] },
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" },
      }),
      img: (tagName, attribs) => {
        const src = attribs.src ?? "";

        if (src.startsWith("cid:")) {
          const mapped = options.cids[src.slice(4)];
          return mapped ? { tagName, attribs: { ...attribs, src: mapped } } : { tagName, attribs: {} };
        }

        // Remote images stay blocked until the reader asks for them.
        return options.allowRemoteImages ? { tagName, attribs } : { tagName, attribs: {} };
      },
    },
  });

  // The parser has already fixed where each block starts and ends, so a
  // closing tag here belongs to its own element.
  return clean.replace(
    /<style>([\s\S]*?)<\/style>/gi,
    (_, css: string) => `<style>${cleanCss(css)}</style>`,
  );
}
