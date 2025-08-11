// hybrid_query_tuning.ts
// Minimal, query-only tuning on top of your existing sparse generator.
// No reindexing required. Leaves your document pipeline untouched.

import OpenAI from "openai";

// ---- Config you likely already have somewhere ----
const OPENAI_EMBED_MODEL = "text-embedding-3-large"; // 3072 dims

// ---- 1) Tiny synonym expansion for generic storefront asks ----
const GENERIC_SYNONYMS: Record<string, string[]> = {
  stuff: ["products", "items", "parts", "catalog", "collections"],
  things: ["products", "items", "parts"],
  have: ["sell", "offer", "stock", "carry"],
  sell: ["offer", "stock", "carry"],
  inventory: ["stock", "products", "catalog"],
};

function expandQuery(q: string): string {
  const lowered = q.toLowerCase();
  const tokens = lowered.split(/[^a-z0-9]+/).filter(Boolean);
  const expanded: string[] = [];
  for (const t of tokens) {
    expanded.push(t);
    const syn = GENERIC_SYNONYMS[t];
    if (syn) expanded.push(...syn);
  }
  // Keep original + expanded words
  return `${q} ${expanded.join(" ")}`.trim();
}

// ---- 2) Query-only tokenizer (keeps + - _ inside tokens) ----
function tokenizeQuery(input: string): string[] {
  if (!input) return [];
  const lowered = input.toLowerCase();
  const rough = lowered.split(/[^a-z0-9+\-_]+/gi).filter(Boolean);
  // Drop only pure single letters; keep short model codes & numbers
  return rough.filter((t) => !(t.length === 1 && /[a-z0-9]/.test(t)));
}

// ---- 3) Your existing hash (copy; identical behavior) ----
function fnv1a32(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash >>> 0) * 0x01000193;
  }
  return hash >>> 0;
}

function hashTokenToIndex(token: string, featureSpaceSize: number): number {
  return (fnv1a32(token) % (featureSpaceSize - 1)) + 1; // reserve 0
}

// ---- 4) Query-only weights (slightly stronger than log for short queries) ----
function computeQuerySparse(tokens: string[], featureSpace: number) {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);

  const idxToW = new Map<number, number>();
  for (const [term, freq] of Array.from(tf.entries())) {
    const idx = hashTokenToIndex(term, featureSpace);
    const wt = Math.sqrt(freq); // strong enough for short queries
    idxToW.set(idx, (idxToW.get(idx) || 0) + wt);
  }

  const sorted = Array.from(idxToW.entries()).sort((a, b) => a[0] - b[0]);
  return {
    indices: sorted.map(([i]) => i),
    values: sorted.map(([_, v]) => v),
  };
}

// ---- 5) Alpha scaling helpers (client-side hybrid balance) ----
function scaleDense(vec: number[], alpha: number) {
  const scale = 1 - alpha;
  return vec.map((v) => v * scale);
}
function scaleSparse(
  sparse: { indices: number[]; values: number[] },
  alpha: number
) {
  return {
    indices: sparse.indices,
    values: sparse.values.map((v) => v * alpha),
  };
}

// ---- 6) Public API: build hybrid vectors for a query (dense + sparse) ----
export async function buildHybridQueryVectors(
  rawQuery: string,
  opts?: { alpha?: number; featureSpace?: number; openaiApiKey?: string }
): Promise<{
  denseScaled: number[];
  sparseScaled: { indices: number[]; values: number[] };
  tokenCount: number;
}> {
  const alpha = opts?.alpha ?? 0.5;
  const featureSpace = opts?.featureSpace ?? 2_000_003;

  // Expand + tokenize for sparse
  const expanded = expandQuery(rawQuery);
  const tokens = tokenizeQuery(expanded);
  const sparse = computeQuerySparse(tokens, featureSpace);

  // Dense
  const openai = new OpenAI({
    apiKey: opts?.openaiApiKey ?? process.env.OPENAI_API_KEY,
  });
  const emb = await openai.embeddings.create({
    model: OPENAI_EMBED_MODEL,
    input: rawQuery, // keep raw (not expanded) for semantics
  });
  const dense = emb.data[0].embedding as number[];

  // Scale
  const denseScaled = scaleDense(dense, alpha);
  const sparseScaled = scaleSparse(sparse, alpha);

  return { denseScaled, sparseScaled, tokenCount: tokens.length };
}

// ---- 7) Simple guard for generic queries (optional) ----
export function shouldFallbackToCollections(
  sparse: { indices: number[]; values: number[] },
  minTerms = 3
): boolean {
  return (sparse.indices?.length ?? 0) < minTerms;
}
