import { currentUser } from "@/lib/auth/require";
import { onMailArrived } from "@/lib/mail/events";

export const runtime = "nodejs";

const HEARTBEAT_MS = 25_000;

// Mail arrives without a request behind it, so open tabs are told over a
// stream. A non-200 here stops the browser retrying, which is what should
// happen once a session is no longer valid.
export async function GET(request: Request) {
  if (!(await currentUser())) return new Response("unauthorized", { status: 401 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let open = true;

      function write(chunk: string) {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // The client went away between the check and the write.
          open = false;
        }
      }

      const stopListening = onMailArrived(() => write("data: arrived\n\n"));

      // Comment lines keep proxies from closing an idle connection.
      const heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);

      request.signal.addEventListener("abort", () => {
        open = false;
        stopListening();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });

      write("data: ready\n\n");
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
      // Stops nginx buffering the stream, which would hold every event back.
      "x-accel-buffering": "no",
    },
  });
}
