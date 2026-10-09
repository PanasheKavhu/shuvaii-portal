/**
 * Exact decimal arithmetic for marks (DATA_MODEL section 6, D31). Pure.
 *
 * JavaScript numbers are binary floats, so 0.1 + 0.2 is not 0.3 and a
 * result of exactly 69.5 can come out as 69.49999. Marks are therefore kept
 * as exact fractions of big integers, the way the database keeps them as
 * numeric. Only non-negative values are needed.
 */

export type Fraction = { num: bigint; den: bigint };

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const TEN = BigInt(10);

/** Decimal places the database keeps before its final rounding (private.round_half_up). */
const CUT_PLACES = 12;

export const fraction = (num: bigint, den: bigint = ONE): Fraction => ({ num, den });

/**
 * Reads a non-negative decimal such as 21, "21", "20.5" or " 7.25 ". Returns
 * null for anything else (blank, negative, letters, exponents, Infinity).
 */
export function parseDecimal(value: number | string): Fraction | null {
  const text =
    typeof value === "number" ? (Number.isFinite(value) ? String(value) : "") : value.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return null;
  const decimals = match[2] ?? "";
  return { num: BigInt(match[1] + decimals), den: TEN ** BigInt(decimals.length) };
}

export const add = (a: Fraction, b: Fraction): Fraction => ({
  num: a.num * b.den + b.num * a.den,
  den: a.den * b.den,
});

export const multiply = (a: Fraction, b: Fraction): Fraction => ({
  num: a.num * b.num,
  den: a.den * b.den,
});

export const divide = (a: Fraction, b: Fraction): Fraction => {
  if (b.num === ZERO) throw new RangeError("division by zero");
  return { num: a.num * b.den, den: a.den * b.num };
};

export const sum = (values: readonly Fraction[]): Fraction => values.reduce(add, fraction(ZERO));

export const equals = (a: Fraction, b: Fraction): boolean => a.num * b.den === b.num * a.den;

/** Half up to `places` decimals, as an integer count of 10^-places. */
function roundToUnits(value: Fraction, places: number): bigint {
  const scale = TEN ** BigInt(places);
  const scaled = value.num * scale;
  // floor(scaled / den + 1/2) for a non-negative value
  return (TWO * scaled + value.den) / (TWO * value.den);
}

/**
 * Rounds half up to `places` decimals, as the database does: first to 12
 * places, then to `places`. Returns a number, exact for display.
 */
export function roundHalfUp(value: Fraction, places = 0): number {
  const cut = roundToUnits(value, CUT_PLACES);
  const units = roundToUnits(fraction(cut, TEN ** BigInt(CUT_PLACES)), places);
  return places === 0 ? Number(units) : Number(units) / 10 ** places;
}
