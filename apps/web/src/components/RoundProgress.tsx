interface RoundProgressProps {
  current: number;
  total: number;
}

/** Five small segments at the top, filled silver as rounds finish. */
export function RoundProgress({ current, total }: RoundProgressProps) {
  return (
    <div
      className="flex gap-1.5"
      role="progressbar"
      aria-label="Round"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current}
      aria-valuetext={`Round ${current} of ${total}`}
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
