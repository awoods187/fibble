import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AnthropicLlmClient, Budget, toCallUsage } from './llm';
import { estimateCostUsd } from './models';

const RAW_USAGE = {
  input_tokens: 1000,
  output_tokens: 500,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};

/** A stand-in for the SDK client that records which endpoint was called. */
function fakeSdk(response: Record<string, unknown>) {
  const plain = vi.fn(async (_params: Record<string, unknown>) => response);
  const beta = vi.fn(async (_params: Record<string, unknown>) => response);
  const sdk = { messages: { parse: plain }, beta: { messages: { parse: beta } } };
  return { sdk: sdk as unknown as Anthropic, plain, beta };
}

const Schema = z.object({ ok: z.boolean() });
const req = (model: 'claude-haiku-5-5' | 'claude-opus-5-5') => ({
  model,
  system: 'sys',
  user: 'hi',
  schema: Schema,
  maxTokens: 100,
  effort: 'low' as const,
});

describe('AnthropicLlmClient', () => {
  it('calls Haiku on the plain endpoint with a cached system prompt and no fallback', async () => {
    const { sdk, plain, beta } = fakeSdk({
      stop_reason: 'end_turn',
      parsed_output: { ok: true },
      usage: RAW_USAGE,
    });
    const result = await new AnthropicLlmClient(sdk).structured(req('claude-haiku-5-5'));
    expect(result).toMatchObject({ ok: true, output: { ok: true } });
    expect(beta).not.toHaveBeenCalled();
    const params = plain.mock.calls[0]?.[0] ?? {};
    expect(params).toMatchObject({ model: 'claude-haiku-5-5', max_tokens: 100 });
    expect(params).not.toHaveProperty('fallbacks');
    expect(params.system).toEqual([
      { type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } },
    ]);
    expect(params.output_config).toMatchObject({ effort: 'low' });
  });

  it('calls Opus on the beta endpoint with the server-side refusal fallback', async () => {
    const { sdk, plain, beta } = fakeSdk({
      stop_reason: 'end_turn',
      parsed_output: { ok: true },
      usage: RAW_USAGE,
    });
    await new AnthropicLlmClient(sdk).structured(req('claude-opus-5-5'));
    expect(plain).not.toHaveBeenCalled();
    expect(beta.mock.calls[0]?.[0]).toMatchObject({
      fallbacks: 'default',
      betas: ['server-side-fallback-2026-07-01'],
    });
  });

  it.each([
    [
      { stop_reason: 'refusal', stop_details: { category: 'cyber' }, parsed_output: null },
      'refusal',
    ],
    [{ stop_reason: 'max_tokens', parsed_output: null }, 'max-tokens'],
    [{ stop_reason: 'end_turn', parsed_output: null }, 'unparseable'],
    [{ stop_reason: 'end_turn', parsed_output: { ok: 'yes' } }, 'unparseable'],
  ])('reports %o as %s, with usage', async (response, reason) => {
    const { sdk } = fakeSdk({ ...response, usage: RAW_USAGE });
    const result = await new AnthropicLlmClient(sdk).structured(req('claude-haiku-5-5'));
    expect(result).toMatchObject({ ok: false, reason });
    expect(result.usage.inputTokens).toBe(1000);
  });
});

describe('cost tracking', () => {
  it('prices a call from its token usage', () => {
    const usage = toCallUsage('claude-opus-5-5', { ...RAW_USAGE, cache_read_input_tokens: 2000 });
    // 1000 * $4 + 2000 * $0.20 + 500 * $20, per million tokens
    expect(usage.usd).toBeCloseTo((4000 + 400 + 10000) / 1e6, 10);
    expect(
      estimateCostUsd('claude-haiku-5-5', {
        inputTokens: 1e6,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      }),
    ).toBe(0.1);
  });

  it('counts cache writes at 1.25x input', () => {
    expect(
      estimateCostUsd('claude-sonnet-5-5', {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 1e6,
        cacheReadTokens: 0,
      }),
    ).toBe(2.5);
  });

  it('Budget totals spend per model and reports when the limit is reached', () => {
    const budget = new Budget(0.02);
    budget.add(toCallUsage('claude-haiku-5-5', RAW_USAGE));
    expect(budget.exhausted).toBe(false);
    budget.add(toCallUsage('claude-opus-5-5', RAW_USAGE));
    expect(budget.spentUsd).toBeCloseTo(0.00035 + 0.014, 10);
    budget.add(toCallUsage('claude-opus-5-5', RAW_USAGE));
    expect(budget.exhausted).toBe(true);
    expect(budget.byModel.get('claude-opus-5-5')).toMatchObject({
      calls: 2,
      inputTokens: 2000,
      outputTokens: 1000,
    });
  });
});
