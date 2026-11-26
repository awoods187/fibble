import { type NextRequest, NextResponse } from 'next/server';
import { newNonce, pageCsp } from '@/lib/security/headers';

/**
 * Gives every page request a fresh CSP nonce (Next.js "Content Security Policy" guide). Next
 * reads the policy from the request header and adds the nonce to its own inline scripts.
 * The API and static files keep the baseline headers from next.config.ts.
 */
export function proxy(request: NextRequest) {
  const csp = pageCsp(newNonce(), { dev: process.env.NODE_ENV === 'development' });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|icons/|sw.js|manifest.webmanifest).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
