/**
 * A query's rows, or a thrown error with `message` for the person. A failed
 * read must not look like an empty list (which would show "no years" or a
 * 404). Logs only the area and the error code, never the data.
 */
export function rowsOrThrow<T>(
  result: { data: T[] | null; error: { code?: string } | null },
  area: string,
  message: string,
): T[] {
  if (result.error) {
    console.error(`${area} read failed`, result.error.code);
    throw new Error(message);
  }
  return result.data ?? [];
}
