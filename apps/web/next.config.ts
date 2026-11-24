import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @fibble/shared ships TypeScript source; let Next compile it.
  transpilePackages: ['@fibble/shared'],
  // The file-based content source reads ../../content-example at runtime.
  outputFileTracingIncludes: {
    '/': ['../../content-example/**'],
    '/api/puzzle/**': ['../../content-example/**'],
  },
};

export default nextConfig;
