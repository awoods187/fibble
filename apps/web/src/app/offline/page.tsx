import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Offline · Fibble' };

/** Shown by the service worker when a page can't load (PRD F10). */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="font-display text-4xl font-semibold tracking-tight text-metal">Fibble</h1>
      <p className="text-lg text-silver-100">You’re offline.</p>
      <p className="text-silver-300">
        Fibble needs a connection to check your answers. Your progress and streak are saved on this
        device, so you can pick up where you left off.
      </p>
      {/* A full page load on purpose: it retries the network instead of a client-side route. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="rounded-xl bg-metal px-10 py-3 font-semibold text-bg">
        Try again
      </a>
    </main>
  );
}
