import type { NextConfig } from "next";

// The app renders attacker-controlled email HTML, so it must never be framed
// and must never have a response sniffed into a different content type.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next injects inline bootstrap styles and scripts. React additionally
      // needs eval to rebuild server callstacks, but only in development; the
      // shipped policy must never carry unsafe-eval.
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
      "style-src 'self' 'unsafe-inline'",
      // Remote images in mail load only after the reader asks, inside the
      // sandboxed frame; https: is what lets that click work.
      "img-src 'self' data: https:",
      // Message bodies render in a sandboxed iframe served from a blob/srcdoc.
      "frame-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
