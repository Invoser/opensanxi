import "dotenv/config";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const config = {
  host: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? process.env.API_SERVER_PORT ?? 8765),
  apiServerKey: process.env.API_SERVER_KEY ?? "",
  upstreamBaseUrl: trimTrailingSlash(
    process.env.UPSTREAM_BASE_URL ??
      process.env.CUSTOM_BASE_URL ??
      process.env.OPENAI_BASE_URL ??
      "https://api.openai.com/v1",
  ),
  upstreamApiKey:
    process.env.UPSTREAM_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
  defaultModel: process.env.DEFAULT_MODEL ?? "gpt-5.5",
  modelReasoningEffort: process.env.MODEL_REASONING_EFFORT ?? "high",
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 120000),
};

export function assertConfig() {
  if (!config.apiServerKey || ["change-me", "replace-me"].includes(config.apiServerKey)) {
    throw new Error("API_SERVER_KEY must be set for local bridge auth.");
  }

  if (!config.upstreamApiKey || config.upstreamApiKey === "replace-me") {
    throw new Error("UPSTREAM_API_KEY or OPENAI_API_KEY must be set.");
  }
}
