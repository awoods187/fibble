import type { MetadataRoute } from 'next';
import { AI_TRAINING_BOTS } from '@/lib/security/ai-bots';

/** /robots.txt: search engines may index the game but never the API; AI training bots get nothing. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: '/api/' },
      { userAgent: [...AI_TRAINING_BOTS], disallow: '/' },
    ],
  };
}
