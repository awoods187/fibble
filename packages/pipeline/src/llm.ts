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
      reason: 'refusal' | 'max-tokens' | 'unparseable';
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
 * Real client. `new Anthropic()` resolves credentials itself: the `ant auth login`
 * profile locally, workload identity federation in CI. Never pass an API key here.
 */
export class AnthropicLlmClient implements LlmClient {
  constructor(private readonly client: Anthropic = new Anthropic()) {}

  async structured<T extends z.ZodType>(
    req: StructuredRequest<T>,
  ): Promise<StructuredResult<z.infer<T>>> {
    // The system prompt is identical across a run, so cache it.
    const system = [
      { type: 'text' as const, text: req.system, cache_control: { type: 'ephemeral' as const } },
    ];
    const messages = [{ role: 'user' as const, content: req.user }];

    const response = FALLBACK_MODELS.has(req.model)
      ? await this.client.beta.messages.parse({
          model: req.model,
          max_tokens: req.maxTokens,
          system,
          messages,
          output_config: { effort: req.effort, format: betaZodOutputFormat(req.schema) },
          betas: [FALLBACK_BETA],
          fallbacks: 'default',
        })
      : await this.client.messages.parse({
          model: req.model,
          max_tokens: req.maxTokens,
          system,
          messages,
          output_config: { effort: req.effort, format: zodOutputFormat(req.schema) },
        });

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
