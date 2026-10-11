/**
 * The caller's network address for rate limits (D28, D45, D47; Phase 4
 * gate). `x-real-ip` is set by the hosting proxy and replaces whatever the
 * client sent; otherwise the right-most `x-forwarded-for` entry, which the
 * nearest proxy appended. The left-most entries are whatever the client
 * claims, so trusting them let anyone pick a fresh limit, or lock out a
 * school's shared address, with one header. "unknown" when neither is set
 * (local runs). Pure.
 */
export function addressFrom(h: Pick<Headers, "get">): string {
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = h
    .get("x-forwarded-for")
    ?.split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  return forwarded?.at(-1) ?? "unknown";
}
