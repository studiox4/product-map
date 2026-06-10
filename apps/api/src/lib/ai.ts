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
