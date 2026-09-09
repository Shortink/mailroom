export async function register() {
  // Node-only work lives in its own module so the edge build never traces
  // into it. Storage reaches for node:fs, which edge has no answer for.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
