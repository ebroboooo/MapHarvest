import { getJob, subscribe } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = getJob(id);
  if (!job) {
    return new Response("Not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
        );
      };

      send({ job: getJob(id) });

      const unsub = subscribe(id, (updated) => {
        send({ job: updated });
        if (
          updated.status === "completed" ||
          updated.status === "failed" ||
          updated.status === "cancelled"
        ) {
          closed = true;
          unsub();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      });

      const heartbeat = setInterval(() => {
        if (closed) {
          clearInterval(heartbeat);
          return;
        }
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 10000);
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
