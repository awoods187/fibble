import { describe, expect, it } from 'vitest';
import { looksBinary, scanBuffer, scanText, SECRET_ENV_NAMES } from './scan';

// Fake credentials are assembled at runtime so this file never contains one
// verbatim; otherwise the repo scan (and GitHub push protection) would flag it.
const j = (...parts: string[]) => parts.join('');
const FAKE = {
  anthropic: j('sk-', 'ant-', 'api03-', 'A'.repeat(40)),
  tavily: j('tvly', '-dev-', 'B'.repeat(28)),
  github: j('gh', 'p_', 'C'.repeat(36)),
  githubFine: j('github', '_pat_', 'D'.repeat(50)),
  aws: j('AK', 'IA', 'E'.repeat(16)),
  pem: j('-----BEGIN ', 'RSA PRIVATE', ' KEY-----'),
  dbUrl: j('postgres', 'ql://fibble:', 'S3cr3tPassw0rd', '@ep-x.neon.tech/db'),
};

const rules = (text: string, opts?: Parameters<typeof scanText>[2]) =>
  scanText(text, 'f.txt', opts).map((f) => f.rule);

describe('scanText', () => {
  it.each([
    ['anthropic-key', FAKE.anthropic],
    ['tavily-key', FAKE.tavily],
    ['github-token', FAKE.github],
    ['github-token', FAKE.githubFine],
    ['aws-access-key', FAKE.aws],
    ['private-key', FAKE.pem],
    ['database-url', FAKE.dbUrl],
  ])('flags a %s', (rule, secret) => {
    expect(rules(`const x = "${secret}";`)).toContain(rule);
  });

  it('reports the line and masks the value', () => {
    const [finding] = scanText(`one\ntwo ${FAKE.anthropic}\n`, 'a.ts');
    expect(finding).toMatchObject({ file: 'a.ts', line: 2, rule: 'anthropic-key' });
    expect(finding?.preview).not.toContain(FAKE.anthropic);
    expect(finding?.preview).toMatch(/^sk-ant-a…\(\d+ chars\)$/);
  });

  it.each(SECRET_ENV_NAMES)('flags %s assigned a literal value, as in a .env file', (name) => {
    expect(rules(`${name}=abcdefgh12345678`)).toContain('secret-env-assignment');
    expect(rules(`export ${name}="abcdefgh12345678"`)).toContain('secret-env-assignment');
  });

  it('allows empty, placeholder and variable values', () => {
    const text = [
      'SEARCH_API_KEY=',
      'DATABASE_URL=   # set in Vercel',
      'SEARCH_API_KEY=$(grep x .env.local)',
      'SEARCH_API_KEY=${{ secrets.SEARCH_API_KEY }}',
      'DATABASE_URL: ${{ secrets.DATABASE_URL }}',
      'postgres://user:password@localhost/db',
      'postgresql://u:<password>@host/db',
      'postgres://u:${PGPASSWORD}@host/db',
      'sk-ant-short',
      'SEARCH_API_KEY="op://Private/fibble-tavily/credential"',
      'DATABASE_URL_PUBLISHER="op://Private/fibble-neon-publisher/connection string" op run -- x',
    ].join('\n');
    expect(rules(text)).toEqual([]);
  });

  it('skips a line marked secret-scan: allow', () => {
    expect(rules(`${FAKE.tavily} // secret-scan: allow`)).toEqual([]);
    expect(rules(`// secret-scan: allow\n${FAKE.tavily}`)).toEqual(['tavily-key']);
  });

  it('flags secret env var names only in bundle mode', () => {
    const code = 'fetch(u,{headers:{k:process.env.SEARCH_API_KEY}})';
    expect(rules(code)).toEqual([]);
    expect(rules(code, { flagSecretNames: true })).toEqual(['secret-env-name']);
    expect(rules('const DATABASE_URL_HINT = 1', { flagSecretNames: true })).toEqual([]);
  });
});

describe('scanBuffer', () => {
  it('skips binary content', () => {
    const buf = new Uint8Array([0x89, 0x50, 0x00, ...new TextEncoder().encode(FAKE.anthropic)]);
    expect(looksBinary(buf)).toBe(true);
    expect(scanBuffer(buf, 'x.png')).toEqual([]);
  });

  it('scans text content', () => {
    expect(scanBuffer(new TextEncoder().encode(FAKE.aws), 'x')).toHaveLength(1);
  });
});
