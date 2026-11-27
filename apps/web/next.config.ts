import type { NextConfig } from 'next';
import { API_HEADERS, SECURITY_HEADERS } from './src/lib/security/headers';

const nextConfig: NextConfig = {
  // Don't advertise the framework in an X-Powered-By header.
  poweredByHeader: false,
  // The workspace packages ship TypeScript source; let Next compile them.
  transpilePackages: ['@fibble/shared', '@fibble/db'],
  // The file-based content source reads ../../content-example at runtime.
  outputFileTracingIncludes: {
    '/': ['../../content-example/**'],
    '/api/puzzle/**': ['../../content-example/**'],
  },
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      { source: '/api/:path*', headers: API_HEADERS },
      // The service worker must be re-checked on every visit, or updates would stall.
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
