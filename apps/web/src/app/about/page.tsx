import { CC_BY_SA_URL } from '@fibble/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/SiteFooter';

export const metadata: Metadata = {
  title: 'About · Fibble',
  description: 'How Fibble works, where the facts come from, and how they are credited.',
};

const REPO = 'https://github.com/awoods187/fibble';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-semibold text-silver-100">{title}</h2>
      <div className="flex flex-col gap-3 text-silver-300">{children}</div>
    </section>
  );
}

const link = 'text-silver-100 underline underline-offset-4 hover:text-white';

/** About and attribution (PRD F12; section 5, "Licensing and attribution"). */
export default function AboutPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-10 px-5 py-10 leading-relaxed">
      <header className="flex items-center justify-between">
        <Link href="/" className="font-display text-3xl font-semibold tracking-tight text-metal">
          Fibble
        </Link>
        <Link
          href="/"
          className="rounded-xl border border-border px-4 py-2 text-sm text-silver-300 hover:border-silver-500"
        >
          Play today’s Fibble
        </Link>
      </header>

      <Section title="How to play">
        <p>
          Every day there are five rounds, one per category: History, Science &amp; Nature,
          Geography &amp; Places, Sports &amp; Games, and Arts &amp; Entertainment. Each round has
          three statements. Two are true. One is a fib. Find it.
        </p>
        <p>
          Swipe right (or tap Truth) on a card you believe; swipe left (or tap Lie) on the one you
          think is the fib. That locks in your answer. Swipe up to skip a card and come back to it.
          On a computer, all three cards show at once: keys 1–3 pick a card, T marks it true, L
          marks it the lie. A list view works everywhere.
        </p>
        <p>A new Fibble starts at midnight where you are.</p>
      </Section>

      <Section title="Where the facts come from">
        <p>
          Every true statement comes from a Wikipedia article. We reword each one in our own words,
          as a single short fact, and check it against a specific revision of the article. After
          each round, the true cards link to their articles so you can read more.
        </p>
        <p>
          The fibs are invented by an AI model, written to sound just as plausible. A second model
          searches for evidence that each fib is actually true, and a person reviews every round
          before it’s published. Fibs never involve living people or accuse real people or companies
          of anything.
        </p>
        <p>
          Spotted a mistake? Reporting is coming soon. Until then, please{' '}
          <a className={link} href={`${REPO}/issues`}>
            open an issue
          </a>
          .
        </p>
      </Section>

      <Section title="Credit and licenses">
        <p>
          Facts are adapted from{' '}
          <a className={link} href="https://en.wikipedia.org/">
            Wikipedia
          </a>
          , whose text is available under the{' '}
          <a className={link} href={CC_BY_SA_URL} rel="license">
            Creative Commons Attribution-ShareAlike 4.0 License
          </a>
          . We changed the text: each statement is a shortened rewording of one fact from its
          article. The authors of each article are listed in its history, linked under every fact in
          “Today you learned”.
        </p>
        <p>
          The true statements Fibble publishes are themselves released under{' '}
          <a className={link} href={CC_BY_SA_URL} rel="license">
            CC BY-SA 4.0
          </a>
          . The fibs are not facts and are not drawn from Wikipedia.
        </p>
        <p>Fibble is not affiliated with or endorsed by Wikipedia or the Wikimedia Foundation.</p>
        <p>
          The app’s code is open source under the{' '}
          <a className={link} href={`${REPO}/blob/main/LICENSE`}>
            GNU AGPL-3.0
          </a>
          , on{' '}
          <a className={link} href={REPO}>
            GitHub
          </a>
          , including how it was built with AI coding tools.
        </p>
      </Section>

      <Section title="Privacy">
        <p>
          There are no accounts and no cookies. Your progress, streak and stats are stored only on
          this device, in your browser’s local storage. The server sees which card you chose in each
          round so it can check your answer. Fibble itself stores nothing about who you are; like
          any website, its host keeps short-lived request logs.
        </p>
      </Section>

      <SiteFooter />
    </main>
  );
}
