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
