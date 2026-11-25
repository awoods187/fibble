import { CATEGORIES, type PublicPuzzle } from '@fibble/shared';
import { connection } from 'next/server';
import { RoundProgress } from '@/components/RoundProgress';
import { StatementCard } from '@/components/StatementCard';
import { getContentSource } from '@/lib/content';
import { getTodaysPublicPuzzle } from '@/lib/todays-puzzle';

export default async function HomePage() {
  // Render per request: which puzzle is "today" depends on the current time.
  await connection();
  const puzzle = await getTodaysPublicPuzzle(getContentSource(), new Date(), {
    fallbackToFirstSample: process.env.NODE_ENV === 'development',
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col items-center gap-8 px-4 py-8">
      <header className="flex w-full items-center justify-between">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-metal">Fibble</h1>
        {puzzle && (
          <span className="font-mono text-sm tracking-stamp text-silver-300">
            #{puzzle.puzzleNumber}
          </span>
        )}
      </header>

      {puzzle ? (
        <Round1 puzzle={puzzle} />
      ) : (
        <p className="my-auto text-silver-300">No puzzle today. Check back after midnight.</p>
      )}

      <footer className="mt-auto text-center text-xs text-silver-500">
        Facts adapted from Wikipedia,{' '}
        <a
          className="underline underline-offset-2 hover:text-silver-300"
          href="https://creativecommons.org/licenses/by-sa/4.0/"
        >
          CC BY-SA 4.0
        </a>
        .
      </footer>
    </main>
  );
}

function Round1({ puzzle }: { puzzle: PublicPuzzle }) {
  const round = puzzle.rounds[0];
  if (!round) return null;
  const emoji = CATEGORIES[0].emoji;

  return (
    <section aria-labelledby="round-title" className="flex w-full flex-col items-center gap-6">
      <RoundProgress current={round.round} total={puzzle.rounds.length} />
      <div className="text-center">
        <h2
          id="round-title"
          className="text-sm font-medium uppercase tracking-category text-silver-300 [font-variant-caps:all-small-caps]"
        >
          <span aria-hidden="true">{emoji} </span>
          {round.category}
        </h2>
        <p className="mt-1 text-sm text-silver-500">Two truths. One fib. Which is the lie?</p>
        {puzzle.sample && (
          <p className="mt-2 font-mono text-xs tracking-stamp text-silver-500">SAMPLE PUZZLE</p>
        )}
      </div>
      <div className="grid w-full justify-items-center gap-4 md:grid-cols-3">
        {round.statements.map((s, i) => (
          <StatementCard key={i} number={i + 1} text={s.text} />
        ))}
      </div>
    </section>
  );
}
