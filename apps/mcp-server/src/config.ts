export type ServerConfig = {
  personalApiBaseUrl: string;
  personalApiToken?: string;
  requestTimeoutMs: number;
  transport: "stdio" | "http";
  host: string;
  port: number;
  path: string;
};

const DEFAULT_TIMEOUT_MS = 15_000;

function readPositiveInteger(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer when set.`);
  }

  return parsed;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export function loadConfig(): ServerConfig {
  const personalApiBaseUrl = process.env.PERSONAL_API_BASE_URL ?? process.env.PERSONAL_API_URL;
  if (!personalApiBaseUrl) {
    throw new Error("PERSONAL_API_BASE_URL or PERSONAL_API_URL is required.");
  }

  const transport = process.env.MCP_TRANSPORT === "stdio" ? "stdio" : "http";

  return {
    personalApiBaseUrl: normalizeBaseUrl(personalApiBaseUrl),
    personalApiToken: process.env.PERSONAL_API_TOKEN,
    requestTimeoutMs: readPositiveInteger("PERSONAL_API_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    transport,
    host: process.env.HOST ?? "0.0.0.0",
    port: readPositiveInteger("PORT", 8787),
    path: process.env.MCP_PATH ?? "/mcp"
  };
}
