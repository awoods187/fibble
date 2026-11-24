interface StatementCardProps {
  /** 1-based card number shown in the corner. */
  number: number;
  text: string;
}

/**
 * A statement card at rest (PRD section 7, "Components"). Static for now:
 * swipe, tilt, tint and the reveal flip come in a later milestone.
 */
export function StatementCard({ number, text }: StatementCardProps) {
  return (
    <article
      aria-label={`Card ${number}`}
      className="relative flex aspect-[3/4] w-[88vw] max-w-[var(--card-max-width)] flex-col rounded-card border border-border bg-surface p-6 shadow-card-edge md:w-full"
    >
      <span className="font-mono text-sm tracking-stamp text-silver-500" aria-hidden="true">
        {String(number).padStart(2, '0')}
      </span>
      <p className="my-auto text-left text-[17px] leading-[1.4] text-silver-100 sm:text-lg">
        {text}
      </p>
    </article>
  );
}
