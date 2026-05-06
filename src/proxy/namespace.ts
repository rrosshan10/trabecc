// Tool-name namespacing. Upstream servers advertise tools like "search_issues";
// the gateway exposes them as "github__search_issues" so a single client sees
// a flat, unambiguous tool list.
//
// Separator is "__" because the MCP tool-name regex only allows
// [a-zA-Z0-9_-]{1,64}; dots and slashes would be rejected by strict clients.

import type { ToolRef, QualifiedToolName } from "../types.ts";

export const NAMESPACE_SEPARATOR = "__";

export function qualify(server: string, tool: string): QualifiedToolName {
  return `${server}${NAMESPACE_SEPARATOR}${tool}`;
}

export function unqualify(qualified: QualifiedToolName): ToolRef | null {
  const idx = qualified.indexOf(NAMESPACE_SEPARATOR);
  if (idx <= 0 || idx === qualified.length - NAMESPACE_SEPARATOR.length) return null;
  return {
    server: qualified.slice(0, idx),
    tool: qualified.slice(idx + NAMESPACE_SEPARATOR.length),
  };
}
