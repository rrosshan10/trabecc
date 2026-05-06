// Argument redaction for the audit log. Anything matching a configured
// pattern in the key path gets replaced with "[REDACTED]".
//
// Each keyword is a *phrase* of one or more segments. A key matches if its
// segment list contains the keyword's segments as a contiguous subsequence.
// Segments are split on non-letter boundaries and camelCase. This avoids
// false positives:
//   "path"        -> ["path"]            does NOT match keyword "pat"
//   "github_pat"  -> ["github", "pat"]   matches keyword ["pat"]
//   "api_key"     -> ["api", "key"]      matches keyword ["api", "key"]
//   "publicKey"   -> ["public", "key"]   does NOT match (not a credential)

const DEFAULT_KEYWORDS: string[] = [
  "password",
  "passwd",
  "secret",
  "token",
  "tokens",
  "api_key",
  "apikey",
  "authorization",
  "auth_token",
  "private_key",
  "privatekey",
  "credential",
  "credentials",
  "pat",
];

function segments(key: string): string[] {
  return key
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

function containsSubseq(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

export function buildRedactor(extra: string[] = []): (value: unknown) => unknown {
  const phrases: string[][] = [...DEFAULT_KEYWORDS, ...extra]
    .map((k) => segments(k))
    .filter((segs) => segs.length > 0);

  function shouldRedactKey(key: string): boolean {
    const segs = segments(key);
    return phrases.some((phrase) => containsSubseq(segs, phrase));
  }

  function walk(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (shouldRedactKey(k)) {
          out[k] = "[REDACTED]";
        } else {
          out[k] = walk(v);
        }
      }
      return out;
    }
    return node;
  }

  return walk;
}
