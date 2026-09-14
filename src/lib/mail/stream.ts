// Reads a body up to a limit and gives up past it, so memory is bounded by the
// limit rather than by whatever the sender claimed. Returns null for anything
// over.
export async function readUpTo(body: ReadableStream<Uint8Array> | null, limit: number) {
  if (!body) return null;

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.length;
      if (total > limit) return null;
      chunks.push(value);
    }
  } finally {
    // Cancelling a finished stream is a no-op; cancelling an abandoned one
    // stops the transfer rather than draining it.
    await reader.cancel().catch(() => {});
  }

  return Buffer.concat(chunks);
}
