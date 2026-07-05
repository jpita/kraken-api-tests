import WebSocket from 'ws';

const WS_URL = 'wss://ws.kraken.com/v2';

export type WsMessage = Record<string, unknown>;
type Predicate = (msg: WsMessage) => boolean;

interface Waiter {
  predicate: Predicate;
  onMatch: (msg: WsMessage) => void;
}

/**
 * Thin event-driven helper over Kraken WS v2. Every message is buffered, and
 * `collect`/`next` resolve from the buffer + live stream via predicates with a
 * hard timeout — no polling, no sleeps (TEST_PLAN.md §6).
 */
export class KrakenWs {
  private readonly buffer: WsMessage[] = [];
  private readonly waiters = new Set<Waiter>();
  private closedWith: Error | null = null;

  private constructor(private readonly socket: WebSocket) {}

  static async connect(url: string = WS_URL): Promise<KrakenWs> {
    const socket = new WebSocket(url);
    const client = new KrakenWs(socket);
    socket.on('message', (raw: WebSocket.RawData) => {
      // Non-JSON frames would be a protocol violation worth surfacing loudly.
      const text = Array.isArray(raw)
        ? Buffer.concat(raw).toString('utf8')
        : Buffer.isBuffer(raw)
          ? raw.toString('utf8')
          : Buffer.from(raw).toString('utf8');
      const msg = JSON.parse(text) as WsMessage;
      client.buffer.push(msg);
      for (const waiter of [...client.waiters]) {
        if (waiter.predicate(msg)) waiter.onMatch(msg);
      }
    });
    socket.on('error', (err) => {
      client.closedWith = err;
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    return client;
  }

  send(payload: Record<string, unknown>): void {
    this.socket.send(JSON.stringify(payload));
  }

  /** All messages received so far (useful for contract sweeps over a session). */
  get received(): readonly WsMessage[] {
    return this.buffer;
  }

  /** Index marker so a later `collect` can ignore everything received before now. */
  mark(): number {
    return this.buffer.length;
  }

  /**
   * Resolve with the first `count` messages matching `predicate` (scanning the
   * buffer from `since`, then the live stream). Rejects after `timeoutMs` with a
   * message that says how many had arrived — half-delivered streams should be
   * diagnosable from the failure alone.
   */
  async collect(
    predicate: Predicate,
    {
      count = 1,
      timeoutMs = 30_000,
      since = 0,
      description = 'message',
    }: { count?: number; timeoutMs?: number; since?: number; description?: string } = {},
  ): Promise<WsMessage[]> {
    if (this.closedWith) throw this.closedWith;
    const matches = this.buffer.slice(since).filter(predicate).slice(0, count);
    if (matches.length >= count) return matches;

    return new Promise<WsMessage[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(
          new Error(
            `Timed out after ${timeoutMs}ms waiting for ${count} × ${description} ` +
              `(got ${matches.length})`,
          ),
        );
      }, timeoutMs);
      const waiter: Waiter = {
        predicate,
        onMatch: (msg) => {
          matches.push(msg);
          if (matches.length >= count) {
            clearTimeout(timer);
            this.waiters.delete(waiter);
            resolve(matches);
          }
        },
      };
      this.waiters.add(waiter);
    });
  }

  async next(
    predicate: Predicate,
    opts: { timeoutMs?: number; since?: number; description?: string } = {},
  ): Promise<WsMessage> {
    const [msg] = await this.collect(predicate, { ...opts, count: 1 });
    if (!msg) throw new Error('collect resolved without a message'); // unreachable
    return msg;
  }

  /** Send subscribe and wait for the matching ack; throws if the API rejects it. */
  async subscribe(params: Record<string, unknown>): Promise<WsMessage> {
    return this.methodCall('subscribe', params);
  }

  async unsubscribe(params: Record<string, unknown>): Promise<WsMessage> {
    return this.methodCall('unsubscribe', params);
  }

  private async methodCall(method: string, params: Record<string, unknown>): Promise<WsMessage> {
    const reqId = Math.floor(Math.random() * 1_000_000_000);
    const since = this.mark();
    this.send({ method, params, req_id: reqId });
    const ack = await this.next((m) => m['method'] === method && m['req_id'] === reqId, {
      since,
      description: `${method} ack (req_id ${reqId})`,
    });
    if (ack['success'] !== true) {
      throw new Error(`${method} rejected: ${JSON.stringify(ack)}`);
    }
    return ack;
  }

  async close(): Promise<void> {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      this.socket.once('close', () => {
        resolve();
      });
      this.socket.close();
    });
  }
}
