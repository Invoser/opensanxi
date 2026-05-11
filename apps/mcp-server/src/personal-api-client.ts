import type { ServerConfig } from "./config.js";

export class PersonalApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly responseBody?: unknown
  ) {
    super(message);
    this.name = "PersonalApiError";
  }
}

export class PersonalApiClient {
  constructor(private readonly config: ServerConfig) {}

  async postTool<TInput extends Record<string, unknown>>(
    toolName: string,
    payload: TInput
  ): Promise<unknown> {
    const url = `${this.config.personalApiBaseUrl}/api/ai/tools/${toolName}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const responseBody = await this.readResponseBody(response);
      if (!response.ok) {
        throw new PersonalApiError(
          `Personal API returned HTTP ${response.status} for ${toolName}.`,
          response.status,
          responseBody
        );
      }

      return responseBody;
    } catch (error) {
      if (error instanceof PersonalApiError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new PersonalApiError(
          `Personal API request timed out after ${this.config.requestTimeoutMs}ms.`
        );
      }

      throw new PersonalApiError(
        error instanceof Error ? error.message : "Unknown Personal API request failure."
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json"
    };

    if (this.config.personalApiToken) {
      headers.Authorization = `Bearer ${this.config.personalApiToken}`;
    }

    return headers;
  }

  private async readResponseBody(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return text;
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
}
