export const ALLOWED_RETURN_REASONS = [
  "SIZE_TOO_SMALL",
  "SIZE_TOO_LARGE",
  "UNWANTED",
  "NOT_AS_DESCRIBED",
  "WRONG_ITEM",
  "DEFECTIVE",
  "STYLE",
  "COLOR",
  "OTHER",
  "UNKNOWN",
] as const;

export type ReturnReason = (typeof ALLOWED_RETURN_REASONS)[number];

function normalizeRaw(input: string): string {
  return input
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[-]+/g, "_")
    .replace(/[^A-Z_]/g, "")
    .trim();
}

export function normalizeReturnReason(input: unknown): ReturnReason {
  if (typeof input !== "string" || input.trim() === "") {
    return "UNKNOWN";
  }

  const original = input.trim();
  const normalized = normalizeRaw(original);

  // Direct match first
  if ((ALLOWED_RETURN_REASONS as readonly string[]).includes(normalized)) {
    return normalized as ReturnReason;
  }

  const text = original.toLowerCase();

  // Size too small
  if (
    /(too\s*small|didn'?t\s*fit\b.*(small|tight)|tight|smaller\s*than\s*expected)/i.test(
      original
    )
  ) {
    return "SIZE_TOO_SMALL";
  }

  // Size too large
  if (
    /(too\s*large|too\s*big|loose|bigger\s*than\s*expected)/i.test(original)
  ) {
    return "SIZE_TOO_LARGE";
  }

  // Unwanted / changed mind
  if (
    /(don'?t\s*want|no\s*longer\s*want|changed\s*my\s*mind|unwanted)/i.test(
      original
    )
  ) {
    return "UNWANTED";
  }

  // Not as described / pictured
  if (
    /(not\s*as\s*described|different\s*than\s*(described|advertised|expected)|not\s*as\s*(pictured|shown))/i.test(
      original
    )
  ) {
    return "NOT_AS_DESCRIBED";
  }

  // Wrong item shipped
  if (
    /(wrong\s*item|incorrect\s*(item|product)|received\s*the\s*wrong)/i.test(
      original
    )
  ) {
    return "WRONG_ITEM";
  }

  // Defective / damaged / not working
  if (
    /(defective|broken|damaged|does\s*not\s*work|doesn'?t\s*work|faulty|malfunction)/i.test(
      original
    )
  ) {
    return "DEFECTIVE";
  }

  // Style
  if (/(style|don'?t\s*like\s*the\s*style|ugly|looks\s*bad)/i.test(original)) {
    return "STYLE";
  }

  // Color / colour
  if (/(color|colour)/i.test(original)) {
    return "COLOR";
  }

  // Other explicit
  if (/(other|misc|miscellaneous)/i.test(original)) {
    return "OTHER";
  }

  return "UNKNOWN";
}

export function coerceReturnReasonNote(
  reason: ReturnReason,
  note: unknown
): string | undefined {
  if (reason === "OTHER") {
    const text = typeof note === "string" ? note.trim() : "";
    return text.length > 0 ? text.slice(0, 500) : undefined;
  }
  const text = typeof note === "string" ? note.trim() : "";
  return text.length > 0 ? text.slice(0, 500) : undefined;
}
