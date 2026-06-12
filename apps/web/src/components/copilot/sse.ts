// Minimal SSE client helpers for the copilot surfaces. Mirrors the parser
// used by AiDraftCard / AiDigestCard (chunk/done/error events with JSON data).

export const STREAM_TIMEOUT_MS = 30_000;

/** Parses an SSE buffer; returns parsed events and the unconsumed remainder. */
export function parseSse(buffer: string): {
  events: { event: string; data: string }[];
  rest: string;
} {
  const events: { event: string; data: string }[] = [];
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  for (const part of parts) {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of part.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    events.push({ event, data: dataLines.join('\n') });
  }
  return { events, rest };
}

export interface StreamSseOptions {
  url: string;
  body: unknown;
  signal: AbortSignal;
  /** Called with the cumulative text after every chunk. */
  onText: (text: string) => void;
}

/**
 * POSTs JSON and consumes the chunk/done/error SSE stream, accumulating
 * `chunk` text. Resolves with the final text; throws on HTTP or stream error.
 */
export async function streamSse({ url, body, signal, onText }: StreamSseOptions): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`${url} failed (${res.status})`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSse(buffer);
    buffer = rest;
    for (const e of events) {
      if (e.event === 'chunk') {
        try {
          const { text: chunk } = JSON.parse(e.data) as { text: string };
          text += chunk;
          onText(text);
        } catch {
          // skip malformed chunk
        }
      } else if (e.event === 'error') {
        throw new Error('generation_failed');
      }
    }
  }
  return text;
}
