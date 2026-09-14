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

export function sanitizeEmailHtml(html: string, options: SanitizeOptions) {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
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
}
