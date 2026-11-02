/**
 * Minimal structured logger: one JSON object per line, which Vercel and most
 * log drains index by field. Never pass prescription contents or tokens here;
 * log ids and error details only.
 */
type Level = "info" | "warn" | "error";

function serializeError(error: unknown): Record<string, unknown> | undefined {
  if (error === undefined) return undefined;
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return { name: error.name, message: error.message, code, stack: error.stack };
  }
  return { message: String(error) };
}

function write(level: Level, message: string, meta: Record<string, unknown> = {}): void {
  const { error, ...rest } = meta;
  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...rest,
    ...(error !== undefined ? { error: serializeError(error) } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => write("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write("error", message, meta),
};
