import { AuthError } from './rnc.js';

/**
 * Minimal MCP client over the RNC SSE transport.
 *
 * The REST surface (`/api/v1/**`) answers 403 to an `mcp`-scoped token — that
 * containment is the point of the scope, not a misconfiguration — so bulk
 * extraction goes through the MCP tools, the same ones an agent sees.
 *
 * Transport: GET /sse yields `event: endpoint` carrying the URL to POST client
 * messages to; replies arrive as `event: message` frames on the same stream.
 */
export class McpClient {
  private postUrl: string | null = null;
  private nextId = 1;
  private pendingByping = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private ready!: Promise<void>;

  constructor(
    private base: string,
    private token: string,
  ) {}

  private get auth() {
    return { Authorization: `Bearer ${this.token}` };
  }

  /** Open the stream and complete the MCP handshake. */
  async connect(): Promise<void> {
    const res = await fetch(`${this.base}/sse`, { headers: { ...this.auth, Accept: 'text/event-stream' } });
    if (res.status === 401) throw new AuthError('token expirado ou revogado — rode `rnc mcp login`');
    if (res.status === 403) throw new Error('403 no /sse — o token não tem escopo `mcp`');
    if (!res.ok || !res.body) throw new Error(`SSE falhou: HTTP ${res.status}`);

    let markReady: () => void;
    this.ready = new Promise((r) => (markReady = r));
    this.reader = res.body.getReader();
    void this.pump(() => markReady());
    await this.ready;

    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'rnc-harness', version: '1' },
    });
    await this.notify('notifications/initialized');
  }

  /** Read the stream, resolving replies and capturing the POST endpoint. */
  private async pump(onEndpoint: () => void): Promise<void> {
    const decoder = new TextDecoder();
    let buf = '';
    let event = 'message';
    const data: string[] = [];

    for (;;) {
      const { done, value } = await this.reader!.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        if (line === '') {
          if (data.length) {
            const payload = data.join('\n');
            data.length = 0;
            if (event === 'endpoint') {
              this.postUrl = new URL(payload, this.base).toString();
              onEndpoint();
            } else if (event === 'message') {
              this.handle(payload);
            }
          }
          event = 'message';
        } else if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
    }
    for (const p of this.pendingByping.values()) p.reject(new Error('stream MCP encerrado'));
    this.pendingByping.clear();
  }

  private handle(raw: string): void {
    let msg: { id?: number; result?: unknown; error?: { message?: string } };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof msg.id !== 'number') return;
    const p = this.pendingByping.get(msg.id);
    if (!p) return;
    this.pendingByping.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message ?? 'erro MCP'));
    else p.resolve(msg.result);
  }

  private async post(body: unknown): Promise<void> {
    if (!this.postUrl) throw new Error('endpoint MCP ainda não anunciado');
    const r = await fetch(this.postUrl, {
      method: 'POST',
      headers: { ...this.auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`POST recusado: HTTP ${r.status}`);
  }

  private async notify(method: string, params?: unknown): Promise<void> {
    await this.post({ jsonrpc: '2.0', method, params });
  }

  private request(method: string, params?: unknown, timeoutMs = 60_000): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingByping.delete(id);
        reject(new Error(`timeout em ${method}`));
      }, timeoutMs);
      this.pendingByping.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.post({ jsonrpc: '2.0', id, method, params }).catch((e: Error) => {
        clearTimeout(timer);
        this.pendingByping.delete(id);
        reject(e);
      });
    });
  }

  async listTools(): Promise<{ name: string; inputSchema?: unknown }[]> {
    const r = (await this.request('tools/list')) as { tools: { name: string; inputSchema?: unknown }[] };
    return r.tools;
  }

  /**
   * Call a tool and parse its payload. MCP returns content blocks; RNC puts a
   * JSON document in the text block, so parse it when it is JSON and hand back
   * the raw string when it is not.
   */
  async call<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const r = (await this.request('tools/call', { name, arguments: args })) as {
      content?: { type: string; text?: string }[];
      isError?: boolean;
    };
    const text = (r.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
    if (r.isError) throw new Error(`${name}: ${text.slice(0, 300)}`);
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  close(): void {
    void this.reader?.cancel().catch(() => {});
  }
}
