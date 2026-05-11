import Fastify from "fastify";
import type { ServerResponse } from "node:http";
import { z } from "zod";
import { assertConfig, config } from "./config.js";

const chatMessageSchema = z.object({
  role: z.string(),
  content: z.unknown().optional(),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
  tool_calls: z.unknown().optional(),
});

const chatCompletionSchema = z.object({
  model: z.string().optional(),
  messages: z.array(chatMessageSchema),
  stream: z.boolean().optional(),
  temperature: z.number().optional(),
  reasoning_effort: z.string().optional(),
  model_reasoning_effort: z.string().optional(),
  max_tokens: z.number().optional(),
  max_completion_tokens: z.number().optional(),
  tools: z.array(z.unknown()).optional(),
  tool_choice: z.unknown().optional(),
});

type ChatMessage = z.infer<typeof chatMessageSchema>;

type ChatToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type ResponsesInputItem = Record<string, unknown>;

function requireAuth(authHeader: string | undefined) {
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  return Boolean(token && token === config.apiServerKey);
}

function contentToText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (part && typeof part === "object") {
          const record = part as Record<string, unknown>;
          if (typeof record.text === "string") {
            return record.text;
          }
          if (typeof record.content === "string") {
            return record.content;
          }
        }

        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  if (content == null) {
    return "";
  }

  return JSON.stringify(content);
}

function mapRole(role: string) {
  if (role === "assistant") {
    return "assistant";
  }

  if (role === "system" || role === "developer") {
    return role;
  }

  return "user";
}

function formatToolCallSummary(toolCalls: ChatToolCall[]) {
  return toolCalls
    .map((toolCall) => {
      const args = toolCall.function.arguments?.trim();
      return `工具调用 ${toolCall.function.name}${args ? ` 参数：${args}` : ""}`;
    })
    .join("\n");
}

function mapInput(messages: ChatMessage[]) {
  return messages.flatMap((message): ResponsesInputItem[] => {
    if (message.role === "tool") {
      return [
        {
          role: "user",
          content: `工具结果${message.tool_call_id ? ` ${message.tool_call_id}` : ""}：\n${contentToText(message.content)}`,
        },
      ];
    }

    const toolCalls = mapChatToolCalls(message.tool_calls);
    if (message.role === "assistant" && toolCalls.length) {
      const text = contentToText(message.content);
      return [
        {
          role: "assistant",
          content: [text, formatToolCallSummary(toolCalls)].filter(Boolean).join("\n"),
        },
      ];
    }

    const input: Record<string, unknown> = {
      role: mapRole(message.role),
      content: contentToText(message.content),
    };

    if (message.name) {
      input.name = message.name;
    }

    return [input];
  });
}

function mapChatToolCalls(value: unknown): ChatToolCall[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((toolCall): ChatToolCall[] => {
    if (!toolCall || typeof toolCall !== "object") {
      return [];
    }

    const record = toolCall as Record<string, unknown>;
    const fn = record.function;
    if (record.type !== "function" || !fn || typeof fn !== "object") {
      return [];
    }

    const functionRecord = fn as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof functionRecord.name !== "string"
    ) {
      return [];
    }

    return [
      {
        id: record.id,
        type: "function",
        function: {
          name: functionRecord.name,
          arguments:
            typeof functionRecord.arguments === "string"
              ? functionRecord.arguments
              : JSON.stringify(functionRecord.arguments ?? {}),
        },
      },
    ];
  });
}

function mapTools(tools: unknown[] | undefined) {
  if (!tools?.length) {
    return undefined;
  }

  return tools
    .map((tool) => {
      if (!tool || typeof tool !== "object") {
        return undefined;
      }

      const record = tool as Record<string, unknown>;
      const fn = record.function;
      if (record.type !== "function" || !fn || typeof fn !== "object") {
        return undefined;
      }

      const functionRecord = fn as Record<string, unknown>;
      if (typeof functionRecord.name !== "string") {
        return undefined;
      }

      return {
        type: "function",
        name: functionRecord.name,
        description:
          typeof functionRecord.description === "string"
            ? functionRecord.description
            : undefined,
        parameters:
          functionRecord.parameters &&
          typeof functionRecord.parameters === "object"
            ? functionRecord.parameters
            : { type: "object", properties: {} },
      };
    })
    .filter(Boolean);
}

function extractText(response: Record<string, unknown>): string {
  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  const output = response.output;
  if (!Array.isArray(output)) {
    return "";
  }

  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (!part || typeof part !== "object") {
        continue;
      }

      const record = part as Record<string, unknown>;
      if (typeof record.text === "string") {
        parts.push(record.text);
      } else if (typeof record.output_text === "string") {
        parts.push(record.output_text);
      }
    }
  }

  return parts.join("");
}

function extractToolCalls(response: Record<string, unknown>): ChatToolCall[] {
  const output = response.output;
  if (!Array.isArray(output)) {
    return [];
  }

  const calls: ChatToolCall[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    if (record.type !== "function_call" || typeof record.name !== "string") {
      continue;
    }

    calls.push({
      id:
        typeof record.call_id === "string"
          ? record.call_id
          : typeof record.id === "string"
            ? record.id
            : `call_${calls.length + 1}`,
      type: "function",
      function: {
        name: record.name,
        arguments:
          typeof record.arguments === "string"
            ? record.arguments
            : JSON.stringify(record.arguments ?? {}),
      },
    });
  }

  return calls;
}

function chatCompletionResponse(params: {
  model: string;
  text: string;
  toolCalls: ChatToolCall[];
}) {
  const id = `chatcmpl_${crypto.randomUUID().replace(/-/g, "")}`;
  const created = Math.floor(Date.now() / 1000);
  const hasToolCalls = params.toolCalls.length > 0;

  return {
    id,
    object: "chat.completion",
    created,
    model: params.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: hasToolCalls ? null : params.text,
          tool_calls: hasToolCalls ? params.toolCalls : undefined,
        },
        finish_reason: hasToolCalls ? "tool_calls" : "stop",
      },
    ],
  };
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function summarizeToolMessages(messages: ChatMessage[]): string | undefined {
  if (!messages.length || messages[messages.length - 1]?.role !== "tool") {
    return undefined;
  }

  const toolMessages: ChatMessage[] = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "tool") {
      break;
    }
    toolMessages.unshift(message);
  }

  if (!toolMessages.length) {
    return undefined;
  }

  const summaries = toolMessages.map((message) => {
    const rawText = contentToText(message.content);
    const parsed = tryParseJson(rawText);

    if (!parsed || typeof parsed !== "object") {
      return rawText ? `工具已返回：${rawText}` : "工具已执行完成。";
    }

    const record = parsed as Record<string, unknown>;
    if (record.ok === true && record.memo && typeof record.memo === "object") {
      const memo = record.memo as Record<string, unknown>;
      const title = typeof memo.title === "string" ? memo.title : "备忘录";
      return `已保存备忘录：${title}`;
    }

    if (
      record.ok === true &&
      record.transaction &&
      typeof record.transaction === "object"
    ) {
      const transaction = record.transaction as Record<string, unknown>;
      const amount =
        typeof transaction.amount === "string" || typeof transaction.amount === "number"
          ? String(transaction.amount)
          : "";
      const currency =
        typeof transaction.currency === "string" ? transaction.currency : "";
      const category =
        typeof transaction.category === "string" ? transaction.category : "未分类";
      const type = transaction.type === "INCOME" ? "收入" : "支出";
      return `已保存${type}记录：${category}${amount ? ` ${currency}${amount}` : ""}`;
    }

    if (record.ok === true) {
      return "工具已执行完成并保存成功。";
    }

    return rawText ? `工具已返回：${rawText}` : "工具已执行完成。";
  });

  return summaries.join("\n");
}

function writeSseChunk(reply: ServerResponse, payload: unknown) {
  reply.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function streamTextResponse(params: {
  reply: ServerResponse;
  model: string;
  text: string;
  finishReason?: string;
}) {
  params.reply.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
  });

  const id = `chatcmpl_${crypto.randomUUID().replace(/-/g, "")}`;
  const created = Math.floor(Date.now() / 1000);

  writeSseChunk(params.reply, {
    id,
    object: "chat.completion.chunk",
    created,
    model: params.model,
    choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
  });

  for (const chunk of params.text.match(/[\s\S]{1,800}/g) ?? [""]) {
    writeSseChunk(params.reply, {
      id,
      object: "chat.completion.chunk",
      created,
      model: params.model,
      choices: [
        { index: 0, delta: { content: chunk }, finish_reason: null },
      ],
    });
  }

  writeSseChunk(params.reply, {
    id,
    object: "chat.completion.chunk",
    created,
    model: params.model,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: params.finishReason ?? "stop",
      },
    ],
  });
  params.reply.write("data: [DONE]\n\n");
  params.reply.end();
}

async function callResponsesApi(payload: z.infer<typeof chatCompletionSchema>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  const model = payload.model ?? config.defaultModel;

  try {
    const body: Record<string, unknown> = {
      model,
      input: mapInput(payload.messages),
    };

    const tools = mapTools(payload.tools);
    if (tools?.length) {
      body.tools = tools;
      if (payload.tool_choice) {
        body.tool_choice = payload.tool_choice;
      }
    }

    if (payload.temperature != null) {
      body.temperature = payload.temperature;
    }

    const reasoningEffort =
      payload.reasoning_effort ??
      payload.model_reasoning_effort ??
      config.modelReasoningEffort;
    if (reasoningEffort) {
      body.reasoning = { effort: reasoningEffort };
    }

    const maxOutputTokens = payload.max_completion_tokens ?? payload.max_tokens;
    if (maxOutputTokens != null) {
      body.max_output_tokens = maxOutputTokens;
    }

    const response = await fetch(`${config.upstreamBaseUrl}/responses`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.upstreamApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Upstream ${response.status}: ${text.slice(0, 500)}`);
    }

    return {
      model,
      response: JSON.parse(text) as Record<string, unknown>,
    };
  } finally {
    clearTimeout(timeout);
  }
}

assertConfig();

const app = Fastify({
  logger: true,
  bodyLimit: 20 * 1024 * 1024,
});

app.get("/health", async () => ({ ok: true }));

app.addHook("preHandler", async (request, reply) => {
  if (request.url === "/health") {
    return;
  }

  if (!requireAuth(request.headers.authorization)) {
    return reply.code(401).send({ error: { message: "Unauthorized" } });
  }
});

app.get("/v1/models", async () => ({
  object: "list",
  data: [
    {
      id: config.defaultModel,
      object: "model",
      created: 0,
      owned_by: "opensanxi",
    },
  ],
}));

app.post("/v1/chat/completions", async (request, reply) => {
  const payload = chatCompletionSchema.parse(request.body);
  const localToolSummary = summarizeToolMessages(payload.messages);
  if (localToolSummary) {
    const model = payload.model ?? config.defaultModel;
    if (payload.stream) {
      streamTextResponse({
        reply: reply.raw,
        model,
        text: localToolSummary,
      });
      return;
    }

    return chatCompletionResponse({
      model,
      text: localToolSummary,
      toolCalls: [],
    });
  }

  const { model, response } = await callResponsesApi(payload);
  const text = extractText(response);
  const toolCalls = extractToolCalls(response);

  if (!payload.stream) {
    return chatCompletionResponse({ model, text, toolCalls });
  }

  reply.raw.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
  });

  const id = `chatcmpl_${crypto.randomUUID().replace(/-/g, "")}`;
  const created = Math.floor(Date.now() / 1000);

  if (toolCalls.length) {
    writeSseChunk(reply.raw, {
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [
        {
          index: 0,
          delta: { role: "assistant", tool_calls: toolCalls },
          finish_reason: null,
        },
      ],
    });
  } else {
    for (const chunk of text.match(/[\s\S]{1,800}/g) ?? [""]) {
      writeSseChunk(reply.raw, {
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [
          { index: 0, delta: { content: chunk }, finish_reason: null },
        ],
      });
    }
  }

  writeSseChunk(reply.raw, {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: toolCalls.length ? "tool_calls" : "stop",
      },
    ],
  });
  reply.raw.write("data: [DONE]\n\n");
  reply.raw.end();
});

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  const statusCode =
    typeof error === "object" && error && "statusCode" in error
      ? Number(error.statusCode)
      : 500;
  const message = error instanceof Error ? error.message : "Unknown bridge error";
  reply.code(statusCode >= 400 ? statusCode : 500).send({
    error: {
      message,
      type: "bridge_error",
    },
  });
});

await app.listen({ host: config.host, port: config.port });
