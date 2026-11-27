import type { MetadataRoute } from 'next';

/** /manifest.webmanifest: makes Fibble installable (PRD F10). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Fibble',
    short_name: 'Fibble',
    description: 'Two truths. One fib. Five rounds. A daily trivia game.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0a0b',
    theme_color: '#0a0a0b',
    categories: ['games', 'education'],
    icons: [
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
