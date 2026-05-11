import "dotenv/config";

export type AppConfig = {
  host: string;
  port: number;
  logLevel: string;
  aiWebhookUrl?: string;
  aiWebhookToken?: string;
};

const parsePort = (value: string | undefined): number => {
  const port = Number(value ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return port;
};

export const config: AppConfig = {
  host: process.env.HOST ?? "0.0.0.0",
  port: parsePort(process.env.PORT),
  logLevel: process.env.LOG_LEVEL ?? "info",
  aiWebhookUrl: process.env.AI_WEBHOOK_URL || undefined,
  aiWebhookToken: process.env.AI_WEBHOOK_TOKEN || undefined
};
