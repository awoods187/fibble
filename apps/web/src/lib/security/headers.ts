/**
 * HTTP security headers for every response (docs/security.md).
 *
 * The baseline CSP here goes on everything, including the API and static files: it stops
 * clickjacking, MIME sniffing and stray form posts. Pages also get the strict, nonce-based
 * policy from `pageCsp` (set per request in src/proxy.ts), which repeats every baseline rule.
 */
const BASELINE_CSP =
  "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

export const SECURITY_HEADERS: { key: string; value: string }[] = [
  {
    key: 'Content-Security-Policy',
    value: BASELINE_CSP,
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // Two years, no preload: preloading is a one-way commitment to make once the domain is final.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

/** API responses are data for the game, never pages to index. */
export const API_HEADERS: { key: string; value: string }[] = [
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
];

/** The baseline CSP directives, shared by both policies. */
const BASELINE = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
];

/**
 * The page CSP: scripts only with this request's nonce (plus what they load, via
 * 'strict-dynamic'); everything else from our own origin. Inline style *attributes* are
 * allowed because nonces can't cover them and the swipe card sets its transform that way.
 * Development adds 'unsafe-eval', which React needs for its debug stacks.
 */
export function pageCsp(nonce: string, { dev }: { dev: boolean }): string {
  if (!/^[A-Za-z0-9+/=]{16,}$/.test(nonce)) throw new Error('CSP nonce must be random base64');
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // Browsers ignore 'unsafe-inline' when a nonce is present, so development (whose hot
    // reload injects un-nonced styles) uses 'unsafe-inline' alone.
    dev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    ...BASELINE,
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

/** A fresh, unguessable nonce for one request. */
export function newNonce(): string {
  return btoa(crypto.randomUUID());
}
