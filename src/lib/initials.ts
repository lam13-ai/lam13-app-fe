/** One or two uppercase initials for an avatar fallback ("Ada Lovelace" → "AL"). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts.at(-1)] : [parts[0]];
  return letters.map((p) => p?.[0]?.toUpperCase() ?? '').join('') || '?';
}
