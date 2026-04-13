/**
 * Structured logger for PR Guardian.
 * Outputs JSON lines in production, readable format in dev.
 */

type LogLevel = "info" | "warn" | "error";

interface LogPayload {
  [key: string]: unknown;
}

function log(level: LogLevel, message: string, payload?: LogPayload): void {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...payload,
  };

  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify(entry));
  } else if (level === "warn") {
    // eslint-disable-next-line no-console
    console.warn(JSON.stringify(entry));
  } else {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(entry));
  }
}

export const logger = {
  info: (message: string, payload?: LogPayload) => log("info", message, payload),
  warn: (message: string, payload?: LogPayload) => log("warn", message, payload),
  error: (message: string, payload?: LogPayload) => log("error", message, payload),
};
