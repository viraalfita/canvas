import type { Env } from "./env";
import { getAccessToken } from "./oauth";

/**
 * Minimal MCP client for HeyGen Remote MCP (Streamable HTTP transport).
 *
 * Spec: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
 * Server: https://mcp.heygen.com/mcp/v1/
 *
 * We don't keep a persistent session — every call re-initializes. HeyGen MCP
 * appears to be stateless at the resource level, and the bridge only fans out
 * short-lived RPCs (list voices, submit video, poll status). If a future
 * version requires session continuity we'll cache `Mcp-Session-Id` in KV.
 */

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse<T = unknown> = {
  jsonrpc: "2.0";
  id: number | string;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
};

let idCounter = 0;
function nextId() {
  return ++idCounter;
}

async function rpc<T>(
  env: Env,
  redirectUri: string,
  method: string,
  params?: Record<string, unknown>,
): Promise<T> {
  const token = await getAccessToken(env, redirectUri);
  if (!token) throw new Error("HeyGen not connected — no access token");

  const body: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: nextId(),
    method,
    params,
  };

  const resp = await fetch(env.HEYGEN_MCP_BASE, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new Error(`MCP ${method} HTTP ${resp.status}: ${await resp.text()}`);
  }

  // Streamable HTTP: response may be SSE or plain JSON. For our short calls we
  // expect JSON; if it's SSE we read the first `data:` event.
  const ct = resp.headers.get("content-type") ?? "";
  let json: JsonRpcResponse<T>;
  if (ct.includes("text/event-stream")) {
    json = await readFirstSseEvent<JsonRpcResponse<T>>(resp);
  } else {
    json = (await resp.json()) as JsonRpcResponse<T>;
  }

  if (json.error) {
    throw new Error(`MCP ${method} error ${json.error.code}: ${json.error.message}`);
  }
  return json.result as T;
}

async function readFirstSseEvent<T>(resp: Response): Promise<T> {
  if (!resp.body) throw new Error("SSE response had no body");
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  // SSE: events delimited by blank line ("\n\n"). Each event has one or more
  // `data:` lines that concatenate (per spec, joined with `\n` minus trailing).
  // We collect complete events and return the first one with JSON data.
  while (true) {
    const { value, done } = await reader.read();
    if (value) buf += decoder.decode(value, { stream: !done });

    let sepIdx: number;
    while ((sepIdx = buf.indexOf("\n\n")) !== -1) {
      const event = buf.slice(0, sepIdx);
      buf = buf.slice(sepIdx + 2);

      const dataLines: string[] = [];
      for (const line of event.split("\n")) {
        if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }
      const data = dataLines.join("\n");
      if (data) return JSON.parse(data) as T;
    }

    if (done) break;
  }

  // Stream ended without `\n\n`. Some servers don't terminate properly —
  // try parsing whatever data: lines we accumulated.
  const dataLines: string[] = [];
  for (const line of buf.split("\n")) {
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  const tail = dataLines.join("\n");
  if (tail) return JSON.parse(tail) as T;
  throw new Error("SSE stream ended without a data event");
}

export async function listTools(
  env: Env,
  redirectUri: string,
): Promise<Array<{ name: string; description?: string; inputSchema?: unknown }>> {
  const r = await rpc<{ tools: Array<{ name: string; description?: string; inputSchema?: unknown }> }>(
    env,
    redirectUri,
    "tools/list",
  );
  return r.tools ?? [];
}

export async function callTool<T = unknown>(
  env: Env,
  redirectUri: string,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const r = await rpc<{
    content?: Array<{ type: string; text?: string }>;
    structuredContent?: T;
    isError?: boolean;
  }>(env, redirectUri, "tools/call", { name, arguments: args });

  if (r.isError) {
    const msg = r.content?.find((c) => c.type === "text")?.text ?? "tool error";
    throw new Error(`Tool ${name} returned error: ${msg}`);
  }

  // Prefer structuredContent when present (MCP 2025-06 spec). Fall back to
  // parsing text content as JSON (older servers).
  if (r.structuredContent !== undefined) return r.structuredContent;
  const text = r.content?.find((c) => c.type === "text")?.text;
  if (text) {
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }
  return undefined as unknown as T;
}
