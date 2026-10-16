const TITLES = new Set(["mr", "mrs", "ms", "miss", "mx", "dr", "prof", "sir", "rev", "pastor"]);

/**
 * The name a page greets someone by: their first name, skipping a title
 * typed into the full name ("Mr Ernest Chakwizira" → "Ernest"). A title
 * with only a surname stays whole ("Mrs Moyo"), so nobody is greeted by
 * their title alone.
 */
export function greetingName(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (!TITLES.has(words[0].replace(/\.$/, "").toLowerCase())) return words[0];
  return words.length >= 3 ? words[1] : words.join(" ");
}
