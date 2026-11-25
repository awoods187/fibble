import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';
import robots from '@/app/robots';
import { POST } from '@/app/api/puzzle/[date]/round/[n]/answer/route';
import { MAX_ANSWER_BODY_BYTES } from '@/lib/puzzle-service';
import { AI_TRAINING_BOTS } from '@/lib/security/ai-bots';
import { params } from './helpers';

const WEB = resolve(import.meta.dirname, '..');

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && /\.(tsx?|mjs|js)$/.test(e.name))
    .map((e) => join(e.parentPath, e.name));
}

describe('secrets never reach the browser', () => {
  it('defines no NEXT_PUBLIC_ variable that looks like a secret', async () => {
    const files = [...(await sourceFiles(join(WEB, 'src'))), join(WEB, 'next.config.ts')];
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      expect(text, file).not.toMatch(
        /NEXT_PUBLIC_\w*(KEY|SECRET|TOKEN|PASSWORD|DATABASE|PRIVATE)/i,
      );
    }
  });

  it('keeps server-only modules out of client components', async () => {
    const forbidden = [
      /from ['"]@\/lib\/content/,
      /from ['"]@\/lib\/puzzle-service/,
      /from ['"]@\/lib\/todays-puzzle/,
      /from ['"](node:)?(fs|child_process|path)(\/promises)?['"]/,
      /from ['"]@fibble\/pipeline/,
      /process\.env\.(?!NODE_ENV\b)/,
    ];
    for (const file of await sourceFiles(join(WEB, 'src'))) {
      const text = await readFile(file, 'utf8');
      if (!/^\s*['"]use client['"]/m.test(text)) continue;
      for (const pattern of forbidden) expect(text, `${file} ${pattern}`).not.toMatch(pattern);
    }
  });
});

describe('security headers', () => {
  it('turns off X-Powered-By', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it('sends the hardening headers on every route and noindex on the API', async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const all = rules.find((r) => r.source === '/:path*');
    const headers = Object.fromEntries(all?.headers.map((h) => [h.key, h.value]) ?? []);
    expect(headers).toMatchObject({
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(headers['Strict-Transport-Security']).toMatch(/max-age=\d{8}/);

    const api = rules.find((r) => r.source === '/api/:path*');
    expect(api?.headers).toContainEqual({
      key: 'X-Robots-Tag',
      value: 'noindex, nofollow, noarchive',
    });
  });
});

describe('robots.txt and AI policy files', () => {
  it('lets search engines in, keeps every crawler out of /api/, and blocks AI training bots', () => {
    const { rules } = robots();
    const list = Array.isArray(rules) ? rules : [rules];
    expect(list).toContainEqual({ userAgent: '*', allow: '/', disallow: '/api/' });
    const ai = list.find((r) => Array.isArray(r.userAgent));
    expect(ai).toEqual({ userAgent: [...AI_TRAINING_BOTS], disallow: '/' });
    expect(AI_TRAINING_BOTS).toEqual(expect.arrayContaining(['GPTBot', 'ClaudeBot', 'CCBot']));
  });

  it('publishes ai.txt and llms.txt asking agents not to reveal answers', async () => {
    const ai = await readFile(join(WEB, 'public/ai.txt'), 'utf8');
    const llms = await readFile(join(WEB, 'public/llms.txt'), 'utf8');
    expect(ai).toMatch(/Training: not permitted/);
    expect(ai).toMatch(/\/api\//);
    expect(llms).toMatch(/Don't fetch, guess or reveal answers/);
    expect(llms).toContain('/ai.txt');
  });
});

describe('answer endpoint abuse limits', () => {
  const post = (body: string, headers: Record<string, string> = {}) =>
    POST(
      new Request('http://test/api/puzzle/2026-11-24/round/1/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body,
      }),
      params({ date: '2026-11-24', n: '1' }),
    );

  it('rejects a body over the size limit with 413', async () => {
    const big = JSON.stringify({ choice: 0, pad: 'x'.repeat(MAX_ANSWER_BODY_BYTES) });
    const res = await post(big);
    expect(res.status).toBe(413);
  });

  it('rejects a declared oversize content-length without reading the body', async () => {
    const res = await post('{"choice":0}', {
      'content-length': String(10 * MAX_ANSWER_BODY_BYTES),
    });
    expect(res.status).toBe(413);
  });

  it('never caches answer responses', async () => {
    const res = await post('{"choice":0}');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
