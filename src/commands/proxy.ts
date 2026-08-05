import { createInterface } from 'node:readline';
import { baseUrl } from '../core/config.js';
import { loadCredential, isExpired } from '../core/credentials.js';

/**
 * `rnc mcp proxy` — a stdio MCP server that fronts the RNC SSE endpoint.
 *
 * Why this exists: the RNC MCP server authenticates with a Bearer token, and an
 * agent config can only inject one through an environment variable. That forces
 * the user to export a token into their shell and restart the agent — the token
 * ends up in two places and the setup needs a restart to take effect. Here the
 * credential store is the single source of truth, so agent config carries no
 * secret and `rnc mcp login` is enough on its own.
 *
 * The bridge is implemented directly rather than delegating to `mcp-remote`,
 * which printed the Authorization header to stderr (it would land in the
 * agent's MCP logs) and failed against this endpoint.
 *
 * Protocol: GET /sse yields `event: endpoint` carrying the URL to POST client
 * messages to; every `event: message` is a server→client frame. stdout carries
 * newline-delimited JSON-RPC and nothing else; diagnostics go to stderr.
 */
export async function proxyCmd(): Promise<void> {
  const base = baseUrl();
  const cred = loadCredential(base);

  if (!cred) {
    process.stderr.write(`rnc: sem credencial para ${base} — rode \`rnc mcp login\`\n`);
    process.exit(1);
  }
  if (isExpired(cred)) {
    process.stderr.write('rnc: credencial expirada — rode `rnc mcp login`\n');
    process.exit(1);
  }
  const auth = { Authorization: `Bearer ${cred.accessToken}` };

  const res = await fetch(`${base}/sse`, { headers: { ...auth, Accept: 'text/event-stream' } }).catch((e: Error) => {
    process.stderr.write(`rnc: não consegui abrir o stream SSE: ${e.message}\n`);
    process.exit(1);
  });
  if (!res.ok || !res.body) {
    process.stderr.write(
      res.status === 401
        ? 'rnc: token expirado ou revogado — rode `rnc mcp login`\n'
        : `rnc: SSE falhou com HTTP ${res.status}\n`,
    );
    process.exit(1);
  }

  /** Resolves once the server tells us where to POST. */
  let postUrl: string | null = null;
  const pending: string[] = [];
  let ready: () => void;
  const endpointKnown = new Promise<void>((r) => (ready = r));

  const send = async (line: string): Promise<void> => {
    if (!postUrl) {
      pending.push(line);
      return;
    }
    const r = await fetch(postUrl, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: line,
    }).catch((e: Error) => {
      process.stderr.write(`rnc: envio falhou: ${e.message}\n`);
      return null;
    });
    if (r && !r.ok) process.stderr.write(`rnc: servidor recusou a mensagem (HTTP ${r.status})\n`);
  };

  // agent → server
  createInterface({ input: process.stdin }).on('line', (line) => {
    if (line.trim()) void send(line);
  });

  // server → agent
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let event = 'message';
  const data: string[] = [];

  const dispatch = () => {
    if (data.length === 0) return;
    const payload = data.join('\n');
    data.length = 0;
    if (event === 'endpoint') {
      postUrl = new URL(payload, base).toString();
      ready();
      void endpointKnown.then(async () => {
        while (pending.length) await send(pending.shift()!);
      });
    } else if (event === 'message') {
      process.stdout.write(payload + '\n');
    }
    event = 'message';
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).replace(/\r$/, '');
      buf = buf.slice(nl + 1);
      if (line === '') dispatch();
      else if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      // id: and comment lines carry nothing this bridge needs
    }
  }

  process.stderr.write('rnc: stream SSE encerrado pelo servidor\n');
  process.exit(1);
}
