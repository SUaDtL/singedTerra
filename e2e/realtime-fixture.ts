import { expect, type Page, type WebSocketRoute } from '@playwright/test';

type PhoenixMessage = [
  joinRef: string | null,
  ref: string | null,
  topic: string,
  event: string,
  payload: Record<string, unknown>,
];

interface ActiveTopic {
  socket: WebSocketRoute;
  ids: string[];
}

/**
 * Keep the browser on a real, connected Supabase Realtime protocol path while
 * individual journey tests decide which database changes are delivered. This
 * prevents REST-only fixtures from accidentally depending on an external
 * WebSocket failure or reconnect timer.
 */
export async function installConnectedRealtimeFixture(page: Page): Promise<{
  joinedTopics: string[];
  expectJoinedTopics: (topicFragments: readonly string[]) => Promise<void>;
  emitPostgresChange: (
    topicFragment: string,
    event: 'INSERT' | 'UPDATE' | 'DELETE',
    record: Record<string, unknown>,
  ) => void;
}> {
  const joinedTopics: string[] = [];
  const activeTopics = new Map<string, ActiveTopic>();
  let bindingId = 0;

  await page.routeWebSocket('**/realtime/v1/websocket**', (socket: WebSocketRoute) => {
    socket.onMessage((raw) => {
      if (typeof raw !== 'string') return;
      const message = JSON.parse(raw) as PhoenixMessage;
      const [joinRef, ref, topic, event, payload] = message;
      if (event === 'phx_leave') {
        activeTopics.delete(topic);
      } else if (event === 'phx_join') {
        const filters = (
          payload['config'] as { postgres_changes?: Array<Record<string, unknown>> } | undefined
        )?.postgres_changes ?? [];
        const admitted = filters.map((filter) => ({
          ...filter,
          id: `fixture-binding-${bindingId += 1}`,
        }));
        joinedTopics.push(topic);
        activeTopics.set(topic, { socket, ids: admitted.map(({ id }) => id) });
        socket.send(JSON.stringify([
          joinRef,
          ref,
          topic,
          'phx_reply',
          { status: 'ok', response: { postgres_changes: admitted } },
        ] satisfies PhoenixMessage));
        return;
      } else if (event !== 'heartbeat') {
        return;
      }
      socket.send(JSON.stringify([
        joinRef,
        ref,
        topic,
        'phx_reply',
        { status: 'ok', response: {} },
      ] satisfies PhoenixMessage));
    });
  });

  return {
    joinedTopics,
    expectJoinedTopics: async (topicFragments) => {
      await expect.poll(() => topicFragments.every((fragment) => (
        [...activeTopics.keys()].some((topic) => topic.includes(fragment))
      ))).toBe(true);
    },
    emitPostgresChange: (topicFragment, event, record) => {
      const active = [...activeTopics.entries()]
        .find(([candidate]) => candidate.includes(topicFragment));
      if (!active) {
        throw new Error(`Realtime fixture has no joined ${topicFragment} channel`);
      }
      const [topic, { socket, ids }] = active;
      socket.send(JSON.stringify([
        null,
        null,
        topic,
        'postgres_changes',
        {
          ids,
          data: {
            type: event,
            schema: 'public',
            table: topicFragment.split(':', 1)[0] ?? topicFragment,
            commit_timestamp: '2026-09-14T00:00:00.000Z',
            columns: [],
            record,
            old_record: {},
            errors: null,
          },
        },
      ] satisfies PhoenixMessage));
    },
  };
}
