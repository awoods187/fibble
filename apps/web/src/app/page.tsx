import { connection } from 'next/server';
import { Game } from '@/components/game/Game';
import { SiteFooter } from '@/components/SiteFooter';
import { getContentSource } from '@/lib/content';
import { getTodaysPublicPuzzle } from '@/lib/todays-puzzle';

export default async function HomePage() {
  // Render per request: which puzzle is "today" depends on the current time. The client then
  // switches to the player's local date. Only public data (no answers) reaches the client.
  await connection();
  const puzzle = await getTodaysPublicPuzzle(getContentSource(), new Date(), {
    fallbackToFirstSample: process.env.NODE_ENV === 'development',
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col items-center gap-8 px-4 py-8">
      <header className="flex w-full items-center justify-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-metal">Fibble</h1>
      </header>

      <Game initialPuzzle={puzzle} />

      <SiteFooter />
    </main>
  );
}
