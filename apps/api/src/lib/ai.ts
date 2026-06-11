import Anthropic from '@anthropic-ai/sdk';
import { TEMPLATES } from '@productmap/templates';
import type { DocType } from '@productmap/shared';

/**
 * Minimal structural interface over the Anthropic SDK so tests can inject a
 * mock client. `messages.stream(...)` must return an async iterable of
 * message stream events (the real MessageStream satisfies this).
 */
export interface AiClient {
  messages: {
    stream(params: {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    }): AsyncIterable<{ type: string; delta?: { type: string; text?: string } }>;
  };
}

const SYSTEM_PROMPT =
  'You write product documents in clean markdown. Follow the provided template structure exactly. No preamble — output starts with the H1.';

function defaultFactory(): AiClient | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey }) as unknown as AiClient;
}

let factory: () => AiClient | null = defaultFactory;

/** Test seam: override the client factory. Pass null to restore the default. */
export function setAiClientFactory(f: (() => AiClient | null) | null): void {
  factory = f ?? defaultFactory;
}

/** Returns an Anthropic client, or null when no ANTHROPIC_API_KEY is configured. */
export function createAiClient(): AiClient | null {
  return factory();
}

export interface GenerateDocInput {
  docType: DocType;
  brief: string;
  feature: { title: string; horizon: string; status: string };
  client: AiClient;
}

/** Streams generated markdown text chunks for a document draft. */
export async function* generateDocStream({
  docType,
  brief,
  feature,
  client,
}: GenerateDocInput): AsyncGenerator<string> {
  const template = TEMPLATES[docType];
  const user = [
    template.promptHints,
    '',
    'Template structure to follow:',
    '',
    template.markdownBody,
    '',
    `Feature: ${feature.title} (horizon: ${feature.horizon}, status: ${feature.status})`,
    '',
    `Brief from the product manager: ${brief}`,
  ].join('\n');

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: user }],
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
      yield event.delta.text;
    }
  }
}

const DIGEST_SYSTEM_PROMPT =
  'You write a short, upbeat weekly product digest in plain markdown. Around 120 words. ' +
  'Summarize what moved on the roadmap and in the docs this week — group related events, ' +
  'name features, skip IDs and timestamps. No preamble, no heading — start with the first sentence.';

export interface DigestEvent {
  kind: string;
  featureTitle: string;
  actorName: string;
  payload: unknown;
  createdAt: string;
}

export interface GenerateDigestInput {
  events: DigestEvent[];
  client: AiClient;
}

/** Streams a ~120-word "this week in ProductMap" digest from recent activity. */
export async function* generateDigestStream({ events, client }: GenerateDigestInput): AsyncGenerator<string> {
  const lines =
    events.length === 0
      ? ['(no activity this week)']
      : events.map(
          (e) =>
            `- ${e.createdAt.slice(0, 10)} ${e.actorName}: ${e.kind} on "${e.featureTitle}"` +
            (e.payload ? ` ${JSON.stringify(e.payload)}` : ''),
        );
  const user = [
    'Activity from the last 7 days (oldest first):',
    '',
    ...lines,
    '',
    'Write the "This week in ProductMap" digest.',
  ].join('\n');

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: DIGEST_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: user }],
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
      yield event.delta.text;
    }
  }
}
