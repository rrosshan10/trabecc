// Stdout is reserved for the MCP wire when running the proxy in stdio mode.
// All diagnostic logging MUST go to stderr. This is the most common footgun
// when writing MCP servers — a stray console.log corrupts the JSON-RPC stream
// and the client silently disconnects.

import pc from "picocolors";

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const envLevel = (process.env["AGENTGATE_LOG"] ?? "info").toLowerCase() as Level;
const threshold = LEVEL_ORDER[envLevel] ?? LEVEL_ORDER.info;

function fmt(level: Level, scope: string, msg: string, meta?: unknown): string {
  const ts = new Date().toISOString();
  const tag = {
    debug: pc.gray("DEBUG"),
    info: pc.cyan("INFO "),
    warn: pc.yellow("WARN "),
    error: pc.red("ERROR"),
  }[level];
  const base = `${pc.dim(ts)} ${tag} ${pc.magenta(scope)} ${msg}`;
  if (meta === undefined) return base;
  try {
    return `${base} ${pc.dim(JSON.stringify(meta))}`;
  } catch {
    return `${base} ${pc.dim("[unserializable meta]")}`;
  }
}

export function createLogger(scope: string) {
  return {
    debug: (msg: string, meta?: unknown) => {
      if (LEVEL_ORDER.debug >= threshold) process.stderr.write(fmt("debug", scope, msg, meta) + "\n");
    },
    info: (msg: string, meta?: unknown) => {
      if (LEVEL_ORDER.info >= threshold) process.stderr.write(fmt("info", scope, msg, meta) + "\n");
    },
    warn: (msg: string, meta?: unknown) => {
      if (LEVEL_ORDER.warn >= threshold) process.stderr.write(fmt("warn", scope, msg, meta) + "\n");
    },
    error: (msg: string, meta?: unknown) => {
      if (LEVEL_ORDER.error >= threshold) process.stderr.write(fmt("error", scope, msg, meta) + "\n");
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
