interface RoundProgressProps {
  /** Rounds finished so far. */
  current: number;
  total: number;
  /** What a screen reader hears, e.g. "Round 2 of 5". */
  label?: string;
}

/** Five small segments at the top, filled silver as rounds finish. */
export function RoundProgress({ current, total, label }: RoundProgressProps) {
  return (
    <div
      className="flex gap-1.5"
      role="progressbar"
      aria-label="Progress"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={current}
      aria-valuetext={label ?? `${current} of ${total} rounds done`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-1 w-8 rounded-full ${i < current ? 'bg-silver-300' : 'bg-border'}`}
        />
      ))}
    </div>
  );
}
