import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import manifest from '@/app/manifest';
import { newNonce, pageCsp } from '@/lib/security/headers';
import { config, proxy } from '@/proxy';

const WEB = resolve(import.meta.dirname, '..');

describe('page Content-Security-Policy', () => {
  const nonce = newNonce();
  const prod = pageCsp(nonce, { dev: false });

  it('allows scripts only with the nonce, and keeps the baseline rules', () => {
    expect(prod).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
    expect(prod).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
    for (const rule of [
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ]) {
      expect(prod).toContain(rule);
    }
    expect(prod).toContain("worker-src 'self'");
    expect(prod).toContain('upgrade-insecure-requests');
  });

  it('adds eval and inline styles only in development', () => {
    const dev = pageCsp(nonce, { dev: true });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("style-src 'self' 'unsafe-inline'");
    expect(prod).toContain(`style-src 'self' 'nonce-${nonce}'`);
  });

  it('uses a fresh random nonce and refuses a bad one', () => {
    expect(newNonce()).not.toBe(newNonce());
    expect(() => pageCsp("x'; script-src *", { dev: false })).toThrow();
  });

  it('the proxy puts the same policy on the request and the response', () => {
    const res = proxy(new NextRequest('https://fibble.test/'));
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(res.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
  });

  it('the proxy skips the API, static files and the service worker', () => {
    const source = config.matcher[0]?.source ?? '';
    const re = new RegExp(`^${source}$`);
    for (const path of ['/', '/about', '/offline']) expect(re.test(path), path).toBe(true);
    for (const path of [
      '/api/puzzle/2026-11-25',
      '/_next/static/x.js',
      '/sw.js',
      '/icons/icon.svg',
    ]) {
      expect(re.test(path), path).toBe(false);
    }
  });
});

describe('installable app', () => {
  it('has a standalone manifest with regular and maskable icons that exist', async () => {
    const m = manifest();
    expect(m).toMatchObject({ name: 'Fibble', display: 'standalone', start_url: '/' });
    expect(m.icons?.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const icon of m.icons ?? [])
      await expect(readFile(join(WEB, 'public', icon.src))).resolves.toBeTruthy();
  });

  it('never caches the API (answers are checked by the server)', async () => {
    const sw = await readFile(join(WEB, 'public/sw.js'), 'utf8');
    expect(sw).toMatch(/url\.pathname\.startsWith\('\/api\/'\)\) return;/);
    expect(sw).toContain("const OFFLINE_URL = '/offline'");
    expect(sw).toMatch(/request\.method !== 'GET'\) return;/);
  });
});

describe('attribution (PRD F12)', () => {
  it('the About page credits Wikipedia under CC BY-SA, says the text was changed, and disclaims endorsement', async () => {
    const about = await readFile(join(WEB, 'src/app/about/page.tsx'), 'utf8');
    expect(about).toContain('CC_BY_SA_URL');
    expect(about).toMatch(/We changed the text/);
    expect(about).toMatch(/not affiliated with or endorsed by Wikipedia/);
    expect(about).toMatch(/released under/);
  });

  it('every page footer links the license and the About page', async () => {
    const footer = await readFile(join(WEB, 'src/components/SiteFooter.tsx'), 'utf8');
    expect(footer).toContain('CC_BY_SA_URL');
    expect(footer).toContain('href="/about"');
  });
});
