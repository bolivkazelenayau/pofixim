import { subscribeToExerciseUpdateNotifications } from '@/lib/server/exercise-update-listener';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 25_000;

function encodeSseEvent(eventName: string, data: unknown) {
  return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(': connected\n\n'));

      unsubscribe = await subscribeToExerciseUpdateNotifications((event) => {
        controller.enqueue(encoder.encode(encodeSseEvent('exercise-updated', event)));
      });

      heartbeatTimer = setInterval(() => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'));
      }, HEARTBEAT_MS);

      request.signal.addEventListener('abort', () => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        unsubscribe?.();
        unsubscribe = null;
        controller.close();
      }, { once: true });
    },
    cancel() {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      unsubscribe?.();
      unsubscribe = null;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
