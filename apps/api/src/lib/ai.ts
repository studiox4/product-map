import { streamText, type LanguageModel } from 'ai';

// @ai-sdk/amazon-bedrock and @aws-sdk/credential-providers are node-only and are
// imported lazily inside defaultModelFactory so the Hono `app` graph stays
// browser-safe (the demo runs with AI disabled and never reaches them).

/** Default Bedrock model (cross-region inference profile). Override with BEDROCK_MODEL_ID. */
export const DEFAULT_BEDROCK_MODEL_ID = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';

const SYSTEM_PROMPT =
  'You write product documents in clean markdown. Follow the provided template structure exactly. No preamble — output starts with the H1.';

/**
 * AI is enabled when AWS auth looks plausible: any of AWS_REGION, AWS_PROFILE
 * or AWS_ACCESS_KEY_ID is set. The standard AWS credential chain (env vars,
 * shared config/SSO profiles, IAM task/instance roles) does the rest.
 */
export function isAiEnabled(): boolean {
  return Boolean(
    process.env.AWS_REGION || process.env.AWS_PROFILE || process.env.AWS_ACCESS_KEY_ID,
  );
}

async function defaultModelFactory(): Promise<LanguageModel | null> {
  if (!isAiEnabled()) return null;
  const { createAmazonBedrock } = await import('@ai-sdk/amazon-bedrock');
  const { fromNodeProviderChain } = await import('@aws-sdk/credential-providers');
  const bedrock = createAmazonBedrock({
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentialProvider: async () => {
      const creds = await fromNodeProviderChain()();
      return {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
      };
    },
  });
  return bedrock(process.env.BEDROCK_MODEL_ID ?? DEFAULT_BEDROCK_MODEL_ID);
}

let modelFactory: () => LanguageModel | null | Promise<LanguageModel | null> =
  defaultModelFactory;

/** Test seam: override the model factory (inject a MockLanguageModelV3). Pass null to restore the default. */
export function setAiModelFactory(f: (() => LanguageModel | null) | null): void {
  modelFactory = f ?? defaultModelFactory;
}

/** Returns a Bedrock language model, or null when AI is disabled (no AWS credentials configured). */
export async function createAiModel(): Promise<LanguageModel | null> {
  return modelFactory();
}

/** Prompt material resolved from a DB template row. */
export interface PromptTemplate {
  promptHints: string;
  bodyMd: string;
}

export interface GenerateDocInput {
  brief: string;
  feature: { title: string; horizon: string; status: string };
  template: PromptTemplate;
  model: LanguageModel;
}

/** Streams generated markdown text chunks for a document draft. */
export async function* generateDocStream({
  brief,
  feature,
  template,
  model,
}: GenerateDocInput): AsyncGenerator<string> {
  const prompt = [
    template.promptHints,
    '',
    'Template structure to follow:',
    '',
    template.bodyMd,
    '',
    `Feature: ${feature.title} (horizon: ${feature.horizon}, status: ${feature.status})`,
    '',
    `Brief from the product manager: ${brief}`,
  ].join('\n');

  const result = streamText({ model, system: SYSTEM_PROMPT, prompt });
  for await (const text of result.textStream) {
    if (text) yield text;
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
  model: LanguageModel;
}

/** Streams a ~120-word "this week in ProductMap" digest from recent activity. */
export async function* generateDigestStream({
  events,
  model,
}: GenerateDigestInput): AsyncGenerator<string> {
  const lines =
    events.length === 0
      ? ['(no activity this week)']
      : events.map(
          (e) =>
            `- ${e.createdAt.slice(0, 10)} ${e.actorName}: ${e.kind} on "${e.featureTitle}"` +
            (e.payload ? ` ${JSON.stringify(e.payload)}` : ''),
        );
  const prompt = [
    'Activity from the last 7 days (oldest first):',
    '',
    ...lines,
    '',
    'Write the "This week in ProductMap" digest.',
  ].join('\n');

  const result = streamText({ model, system: DIGEST_SYSTEM_PROMPT, prompt });
  for await (const text of result.textStream) {
    if (text) yield text;
  }
}
