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
];

export function sanitizeEmailHtml(html: string, options: SanitizeOptions) {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      "*": ["style", "class", "align", "width", "height", "colspan", "rowspan"],
      a: ["href", "target", "rel"],
      img: ["src", "alt", "width", "height"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    // Without an explicit allowlist sanitize-html passes every declaration
    // through, so background:url() would fetch remotely and defeat the image
    // blocking below. Nothing here accepts a url().
    allowedStyles: {
      "*": {
        color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s,.%]+\)$/i, /^[a-z]+$/i],
        "background-color": [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s,.%]+\)$/i, /^[a-z]+$/i],
        "text-align": [/^(left|right|center|justify)$/],
        "font-weight": [/^(bold|bolder|lighter|normal|[1-9]00)$/],
        "font-style": [/^(italic|normal)$/],
        "font-size": [/^\d+(\.\d+)?(px|em|rem|pt|%)$/],
        "text-decoration": [/^(underline|line-through|none)$/],
        padding: [/^[\d.\s]+(px|em|rem|%)?$/],
        margin: [/^[\d.\s]+(px|em|rem|%)?$/],
      },
    },
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
