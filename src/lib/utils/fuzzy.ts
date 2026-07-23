/** Normalize a string for fuzzy comparison: lowercase, strip punctuation. */
export function normalize(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Similarity in [0,1] based on normalized Levenshtein distance. */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const dist = levenshtein(na, nb);
  return 1 - dist / Math.max(na.length, nb.length);
}

export interface DuplicateCandidate {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
}

export interface DuplicateMatch<T> {
  contact: T;
  score: number;
  reason: string;
}

/**
 * Find existing contacts that likely refer to the same person as the extracted
 * name/company/email. Returns matches sorted by confidence (highest first).
 */
export function findDuplicates<T extends DuplicateCandidate>(
  contacts: T[],
  extracted: { name: string; company: string | null; email: string | null },
): DuplicateMatch<T>[] {
  const matches: DuplicateMatch<T>[] = [];
  const exEmail = normalize(extracted.email);

  for (const c of contacts) {
    // Strong signal: same email.
    if (exEmail && normalize(c.email) === exEmail) {
      matches.push({ contact: c, score: 1, reason: "Same email address" });
      continue;
    }
    const nameSim = similarity(extracted.name, c.name);
    if (nameSim >= 0.82) {
      const companySim =
        extracted.company && c.company
          ? similarity(extracted.company, c.company)
          : 0;
      // Same/similar name; boost when company also matches.
      if (companySim >= 0.7 || nameSim >= 0.92) {
        matches.push({
          contact: c,
          score: Math.min(1, nameSim * 0.7 + companySim * 0.3 + 0.05),
          reason:
            companySim >= 0.7
              ? "Similar name at the same company"
              : "Very similar name",
        });
      }
    }
  }
  return matches.sort((a, b) => b.score - a.score);
}
