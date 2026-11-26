import { CC_BY_SA_URL } from '@fibble/shared';
import Link from 'next/link';

/** Attribution on every page (PRD F12): facts adapted from Wikipedia, CC BY-SA 4.0. */
export function SiteFooter() {
  return (
    <footer className="mt-auto flex flex-col items-center gap-1 text-center text-xs text-silver-500">
      <p>
        Facts adapted from Wikipedia,{' '}
        <a
          className="underline underline-offset-2 hover:text-silver-300"
          href={CC_BY_SA_URL}
          rel="license"
        >
          CC BY-SA 4.0
        </a>
        . Not affiliated with Wikipedia.
      </p>
      <Link className="underline underline-offset-2 hover:text-silver-300" href="/about">
        About Fibble
      </Link>
    </footer>
  );
}
