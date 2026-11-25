/**
 * HTTP security headers for every response (docs/security.md).
 *
 * No script-src CSP yet: Next.js inline scripts need nonces, which arrive with
 * the PWA work. The directives here don't affect scripts, so they can't break
 * the app, and they stop clickjacking, MIME sniffing and stray form posts.
 */
export const SECURITY_HEADERS: { key: string; value: string }[] = [
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
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
