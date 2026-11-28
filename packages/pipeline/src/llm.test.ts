import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AnthropicLlmClient, Budget, isTransient, toCallUsage } from './llm';
import { estimateCostUsd } from './models';

const RAW_USAGE = {
  input_tokens: 1000,
  output_tokens: 500,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};

/** A stand-in for the SDK client that records which endpoint was called. */
/** `responses` are returned in turn (the last one repeats); an Error is thrown instead. */
function fakeSdk(...responses: (Record<string, unknown> | Error)[]) {
  let n = 0;
  const stream = () => ({
    finalMessage: async () => {
      const response = responses[Math.min(n++, responses.length - 1)];
      if (response instanceof Error) throw response;
      return response;
    },
  });
  const plain = vi.fn((_params: Record<string, unknown>) => stream());
  const beta = vi.fn((_params: Record<string, unknown>) => stream());
  const sdk = { messages: { stream: plain }, beta: { messages: { stream: beta } } };
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
    const result = await new AnthropicLlmClient(sdk, 0).structured(req('claude-haiku-5-5'));
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
    await new AnthropicLlmClient(sdk, 0).structured(req('claude-opus-5-5'));
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
    const result = await new AnthropicLlmClient(sdk, 0).structured(req('claude-haiku-5-5'));
    expect(result).toMatchObject({ ok: false, reason });
    expect(result.usage.inputTokens).toBe(1000);
  });
});

describe('API failures', () => {
  it('reports a call that keeps timing out as api-error with no spend, after 3 tries', async () => {
    const { sdk, beta } = fakeSdk(new Anthropic.APIConnectionTimeoutError());
    const result = await new AnthropicLlmClient(sdk, 0).structured(req('claude-opus-5-5'));
    expect(result).toMatchObject({ ok: false, reason: 'api-error' });
    expect(result.usage.usd).toBe(0);
    expect(beta).toHaveBeenCalledTimes(3);
  });

  it('retries a stream that dropped mid-response, and succeeds', async () => {
    const dropped = new Anthropic.AnthropicError('terminated');
    const { sdk, beta } = fakeSdk(dropped, {
      stop_reason: 'end_turn',
      parsed_output: { ok: true },
      usage: RAW_USAGE,
    });
    const result = await new AnthropicLlmClient(sdk, 0).structured(req('claude-opus-5-5'));
    expect(result).toMatchObject({ ok: true, output: { ok: true } });
    expect(beta).toHaveBeenCalledTimes(2);
  });

  it('stops the run on errors that mean a bug or a setup problem', async () => {
    const auth = new Anthropic.AuthenticationError(401, undefined, 'no', new Headers());
    const { sdk } = fakeSdk(auth);
    await expect(new AnthropicLlmClient(sdk, 0).structured(req('claude-haiku-5-5'))).rejects.toBe(
      auth,
    );
    await expect(
      new AnthropicLlmClient(fakeSdk(new TypeError('bug')).sdk, 0).structured(
        req('claude-haiku-5-5'),
      ),
    ).rejects.toThrow('bug');
  });

  it('treats timeouts, rate limits and server errors as transient', () => {
    expect(isTransient(new Anthropic.APIConnectionError({ message: 'reset' }))).toBe(true);
    expect(isTransient(new Anthropic.RateLimitError(429, undefined, 'slow', new Headers()))).toBe(
      true,
    );
    expect(
      isTransient(new Anthropic.InternalServerError(529, undefined, 'busy', new Headers())),
    ).toBe(true);
    expect(isTransient(new Anthropic.BadRequestError(400, undefined, 'bad', new Headers()))).toBe(
      false,
    );
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
