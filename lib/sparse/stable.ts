// Stable tokenizer + hashing-based sparse vector generator

export type SparseVector = {
  indices: number[];
  values: number[];
};

// Tokenizer: split on non-alphanumeric boundaries (ASCII-safe for ES5 target)
export function tokenizeText(input: string): string[] {
  if (!input) return [];
  const lowered = input.toLowerCase();
  const tokens = lowered.split(/[^a-z0-9]+/gi).filter((t) => t.length > 1);
  return tokens;
}

// FNV-1a 32-bit hash for stability and speed
export function fnv1a32(str: string): number {
  let hash = 0x811c9dc5; // offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash >>> 0) * 0x01000193; // multiply by FNV prime (mod 2^32)
  }
  // Ensure unsigned 32-bit
  return hash >>> 0;
}

// Map token to stable index in a large feature space to reduce collisions
export function hashTokenToIndex(
  token: string,
  featureSpaceSize: number
): number {
  // Reserve 0 as a sentinel; shift by 1 to keep indices >= 1
  return (fnv1a32(token) % (featureSpaceSize - 1)) + 1;
}

// Optional: minimal stopword list to reduce extreme noise
const STOPWORDS: Set<string> = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "for",
  "to",
  "of",
  "in",
  "on",
  "is",
  "it",
  "with",
  "by",
  "at",
]);

// Compute TF-based weights with log-scaling for robustness
function computeWeights(tokens: string[], featureSpace: number): SparseVector {
  const termFrequency = new Map<string, number>();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (STOPWORDS.has(token)) continue;
    termFrequency.set(token, (termFrequency.get(token) || 0) + 1);
  }

  // Aggregate by hashed index to avoid duplicate indices in sparse vector
  const indexToWeight = new Map<number, number>();
  const termEntries = Array.from(termFrequency.entries());
  for (let i = 0; i < termEntries.length; i++) {
    const [term, tf] = termEntries[i];
    const index = hashTokenToIndex(term, featureSpace);
    const weight = 1 + Math.log(tf);
    indexToWeight.set(index, (indexToWeight.get(index) || 0) + weight);
  }

  // Deterministic ordering by index
  const sortedEntries = Array.from(indexToWeight.entries()).sort(
    (a, b) => a[0] - b[0]
  );
  const indices: number[] = sortedEntries.map(([idx]) => idx);
  const values: number[] = sortedEntries.map(([_, wt]) => wt);

  return { indices, values };
}

export function generateSparseVectorsStable(
  text: string,
  featureSpace: number = 2_000_003
): SparseVector {
  const tokens = tokenizeText(text || "");
  return computeWeights(tokens, featureSpace);
}
