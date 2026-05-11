import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { subscribeSchedule } from '@/lib/sse';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if ('response' in guard) return guard.response;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (chunk: string) => controller.enqueue(encoder.encode(chunk));

      send(`: connected\n\n`);

      const unsubscribe = subscribeSchedule(event => {
        try {
          send(`event: schedule\ndata: ${JSON.stringify(event)}\n\n`);
        } catch {
          // controller may already be closed
        }
      });

      const ping = setInterval(() => {
        try {
          send(`: ping\n\n`);
        } catch {
          /* noop */
        }
      }, 25_000);

      req.signal.addEventListener('abort', () => {
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* noop */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
