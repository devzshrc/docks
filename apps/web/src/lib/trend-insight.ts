/** Which direction is good news for a metric; "neutral" never colours a change. */
export type Polarity = "higher" | "lower" | "neutral";
export type Tone = "good" | "bad" | "neutral";

export type WeekInsight = {
  /** Change from the week before, or null when either week has no value. */
  delta: number | null;
  deltaTone: Tone;
  /** Mean of the weeks that have a value. */
  average: number;
  /** One plain-language takeaway for this point. */
  headline: string;
  headlineTone: Tone;
};

const toneFor = (change: number, polarity: Polarity): Tone =>
  change === 0 || polarity === "neutral" ? "neutral" : (change > 0) === (polarity === "higher") ? "good" : "bad";

/**
 * Explains one point of a weekly series in context: against the week before,
 * the window's peak and low, and its average. Checks run from most to least notable.
 */
export function weekInsight(
  values: (number | null)[],
  index: number,
  { polarity = "higher", format = String }: { polarity?: Polarity; format?: (v: number) => string } = {},
): WeekInsight {
  const known = values.filter((v): v is number => v !== null);
  const average = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 0;
  const value = values[index] ?? null;
  const prev = index > 0 ? (values[index - 1] ?? null) : null;
  const delta = value !== null && prev !== null ? value - prev : null;
  const deltaTone = delta === null ? "neutral" : toneFor(delta, polarity);
  const result = (headline: string, headlineTone: Tone): WeekInsight => ({ delta, deltaTone, average, headline, headlineTone });

  if (value === null) return result("No data for this week", "neutral");
  const max = Math.max(...known);
  const min = Math.min(...known);
  const weeks = values.length;
  if (max !== min) {
    const onlyOne = (target: number) => known.filter((v) => v === target).length === 1;
    if (value === max && onlyOne(max)) return result(`Highest in ${weeks} weeks`, toneFor(1, polarity));
    if (value === min && onlyOne(min)) return result(`Lowest in ${weeks} weeks`, toneFor(-1, polarity));
  }
  if (prev === 0 && value > 0 && values.slice(0, index).every((v) => !v)) return result("First activity in this window", "neutral");
  if (delta !== null && prev) {
    const ratio = value / prev;
    if (ratio >= 2) return result(`${Number.isInteger(ratio) ? ratio : ratio.toFixed(1)}× the week before`, deltaTone);
    if (ratio <= 0.5) return result(`Down ${Math.round((1 - ratio) * 100)}% from the week before`, deltaTone);
  }
  const gap = value - average;
  if (Math.abs(gap) < Math.max(average * 0.1, 0.05)) return result(`In line with the ${weeks}-week average`, "neutral");
  return result(
    `${gap > 0 ? "Above" : "Below"} the ${weeks}-week average of ${format(Math.round(average * 10) / 10)}`,
    toneFor(gap, polarity),
  );
}
