import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import { estimateCostUsd, type ModelId, type TokenUsage } from './models';

/**
 * The pipeline's only door to Claude. Stages depend on the LlmClient interface,
 * so tests pass a fake and never call the API (CLAUDE.md rule 4).
 */

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface StructuredRequest<T extends z.ZodType> {
  model: ModelId;
  system: string;
  user: string;
  schema: T;
  maxTokens: number;
  effort: Effort;
}

export interface CallUsage extends TokenUsage {
  model: ModelId;
  usd: number;
}

export type StructuredResult<T> =
  | { ok: true; output: T; usage: CallUsage }
  | {
      ok: false;
      /** api-error: the call never completed (timeout, dropped connection, server error). */
      reason: 'refusal' | 'max-tokens' | 'unparseable' | 'api-error';
      detail?: string;
      usage: CallUsage;
    };

export interface LlmClient {
  structured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<StructuredResult<z.infer<T>>>;
}

/** Models with a server-side refusal fallback (beta). Haiku 5.5 has none. */
const FALLBACK_MODELS = new Set<ModelId>(['claude-opus-5-5', 'claude-sonnet-5-5']);
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

interface RawUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function toCallUsage(model: ModelId, u: RawUsage): CallUsage {
  const usage: TokenUsage = {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
  };
  return { model, ...usage, usd: estimateCostUsd(model, usage) };
}

/**
 * Errors worth skipping past: timeouts, dropped connections, rate limits and server errors.
 * Anything else (bad request, auth, permission) is a bug or a setup problem, so it stops the run.
 */
export function isTransient(err: unknown): boolean {
  if (err instanceof Anthropic.APIConnectionError) return true; // includes timeouts
  // A stream that drops mid-response (network loss, the machine sleeping) surfaces as a plain
  // AnthropicError wrapping the network error, e.g. "terminated".
  if (err instanceof Anthropic.AnthropicError && !(err instanceof Anthropic.APIError)) {
    return err.cause instanceof Error || err.message === 'terminated';
  }
  if (err instanceof Anthropic.APIError) {
    const s = err.status ?? 0;
    return s === 408 || s === 409 || s === 429 || s >= 500;
  }
  return false;
}

/**
 * Real client. `new Anthropic()` resolves credentials itself: the `ant auth login`
 * profile locally, workload identity federation in CI. Never pass an API key here.
 */
/** Attempts per call when it fails transiently, and the first backoff (doubled each time). */
export const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5_000;

export class AnthropicLlmClient implements LlmClient {
  constructor(
    private readonly client: Anthropic = new Anthropic(),
    private readonly retryDelayMs = RETRY_DELAY_MS,
  ) {}

  async structured<T extends z.ZodType>(
    req: StructuredRequest<T>,
  ): Promise<StructuredResult<z.infer<T>>> {
    // The system prompt is identical across a run, so cache it.
    const system = [
      { type: 'text' as const, text: req.system, cache_control: { type: 'ephemeral' as const } },
    ];
    const messages = [{ role: 'user' as const, content: req.user }];

    // Streamed, so a long Opus answer can't hit the SDK's connection timeout; finalMessage()
    // returns the parsed structured output. A transient failure is retried with backoff; if it
    // keeps failing it's reported as api-error, so one bad call drops one item, not the run.
    const send = async () =>
      FALLBACK_MODELS.has(req.model)
        ? await this.client.beta.messages
            .stream({
              model: req.model,
              max_tokens: req.maxTokens,
              system,
              messages,
              output_config: { effort: req.effort, format: betaZodOutputFormat(req.schema) },
              betas: [FALLBACK_BETA],
              fallbacks: 'default',
            })
            .finalMessage()
        : await this.client.messages
            .stream({
              model: req.model,
              max_tokens: req.maxTokens,
              system,
              messages,
              output_config: { effort: req.effort, format: zodOutputFormat(req.schema) },
            })
            .finalMessage();
    let response: Awaited<ReturnType<typeof send>> | undefined;
    for (let attempt = 1; !response; attempt++) {
      try {
        response = await send();
      } catch (err) {
        if (!isTransient(err)) throw err;
        if (attempt >= MAX_ATTEMPTS) {
          return {
            ok: false,
            reason: 'api-error',
            detail: err instanceof Error ? err.message : 'unknown',
            usage: toCallUsage(req.model, { input_tokens: 0, output_tokens: 0 }),
          };
        }
        await new Promise((r) => setTimeout(r, this.retryDelayMs * 2 ** (attempt - 1)));
      }
    }

    const usage = toCallUsage(req.model, response.usage);
    if (response.stop_reason === 'refusal') {
      return {
        ok: false,
        reason: 'refusal',
        detail: response.stop_details?.category ?? undefined,
        usage,
      };
    }
    if (response.stop_reason === 'max_tokens') return { ok: false, reason: 'max-tokens', usage };
    const parsed = req.schema.safeParse(response.parsed_output);
    if (!parsed.success) return { ok: false, reason: 'unparseable', usage };
    return { ok: true, output: parsed.data as z.infer<T>, usage };
  }
}

/** Tracks estimated spend and says when a run must stop. */
export class Budget {
  private spent = 0;
  readonly byModel = new Map<
    ModelId,
    { calls: number; usd: number; inputTokens: number; outputTokens: number }
  >();

  constructor(readonly limitUsd: number) {}

  add(usage: CallUsage): void {
    this.spent += usage.usd;
    const m = this.byModel.get(usage.model) ?? {
      calls: 0,
      usd: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    m.calls++;
    m.usd += usage.usd;
    m.inputTokens += usage.inputTokens + usage.cacheCreationTokens + usage.cacheReadTokens;
    m.outputTokens += usage.outputTokens;
    this.byModel.set(usage.model, m);
  }

  get spentUsd(): number {
    return this.spent;
  }

  /** True once spend has reached the limit: start no new work. */
  get exhausted(): boolean {
    return this.spent >= this.limitUsd;
  }
}
