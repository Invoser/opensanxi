import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PersonalApiClient, PersonalApiError } from "./personal-api-client.js";

const optionalIsoDateTime = z
  .string()
  .min(1)
  .describe("ISO 8601 date or datetime string, preferably including timezone.")
  .optional();

const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM format, for example 2026-05.");

const memoTagsSchema = z
  .array(z.string().min(1).max(64))
  .max(20)
  .optional()
  .describe("Optional memo tags.");

const addMemoSchema = {
  title: z.string().min(1).max(200).optional().describe("Short optional memo title."),
  content: z.string().min(1).max(20_000).describe("Memo body to store."),
  tags: memoTagsSchema,
  occurred_at: optionalIsoDateTime.describe("When the memo subject happened, if known."),
  source: z.string().min(1).max(100).optional().describe("Optional source label, such as chat.")
};

const searchMemosSchema = {
  query: z.string().min(1).max(500).describe("Search text."),
  tags: memoTagsSchema,
  from: optionalIsoDateTime.describe("Lower bound for memo creation or occurrence time."),
  to: optionalIsoDateTime.describe("Upper bound for memo creation or occurrence time."),
  include_archived: z.boolean().optional().describe("Whether archived memos should be included."),
  limit: z.number().int().min(1).max(50).optional().describe("Maximum number of memos to return.")
};

const transactionTypeSchema = z.enum(["income", "expense"]);
const transactionTagsSchema = z.array(z.string().min(1).max(64)).max(20).optional();

const addTransactionSchema = {
  type: transactionTypeSchema.describe("Transaction type."),
  amount: z.number().positive().describe("Positive transaction amount."),
  currency: z.string().min(3).max(3).default("CNY").describe("ISO 4217 currency code."),
  category: z.string().min(1).max(100).describe("Normalized category, such as food or salary."),
  merchant: z.string().min(1).max(200).optional().describe("Merchant or counterparty."),
  note: z.string().max(1000).optional().describe("Optional note."),
  occurred_at: z
    .string()
    .min(1)
    .describe("ISO 8601 datetime when the transaction happened, preferably with timezone."),
  payment_method: z.string().min(1).max(100).optional().describe("Optional payment method."),
  account: z.string().min(1).max(100).optional().describe("Optional account or wallet name."),
  tags: transactionTagsSchema.describe("Optional transaction tags.")
};

const queryTransactionsSchema = {
  type: transactionTypeSchema.optional().describe("Filter by transaction type."),
  query: z.string().min(1).max(500).optional().describe("Free-text search over notes and merchants."),
  category: z.string().min(1).max(100).optional().describe("Filter by category."),
  merchant: z.string().min(1).max(200).optional().describe("Filter by merchant or counterparty."),
  currency: z.string().min(3).max(3).optional().describe("Filter by ISO 4217 currency code."),
  from: optionalIsoDateTime.describe("Inclusive lower occurred_at bound."),
  to: optionalIsoDateTime.describe("Inclusive upper occurred_at bound."),
  min_amount: z.number().nonnegative().optional().describe("Minimum amount."),
  max_amount: z.number().nonnegative().optional().describe("Maximum amount."),
  include_archived: z.boolean().optional().describe("Whether archived transactions should be included."),
  limit: z.number().int().min(1).max(100).optional().describe("Maximum number of transactions."),
  offset: z.number().int().min(0).optional().describe("Pagination offset.")
};

const monthlyFinanceSummarySchema = {
  month: monthSchema.describe("Month to summarize in YYYY-MM format."),
  timezone: z.string().min(1).max(100).default("Asia/Shanghai").describe("IANA timezone name."),
  currency: z.string().min(3).max(3).optional().describe("Optional ISO 4217 currency filter.")
};

type ToolPayload = Record<string, unknown>;

export function registerPersonalAssistantTools(server: McpServer, client: PersonalApiClient): void {
  registerPersonalApiTool(
    server,
    client,
    "add_memo",
    "Add memo",
    "Create a memo through the Personal API.",
    addMemoSchema
  );

  registerPersonalApiTool(
    server,
    client,
    "search_memos",
    "Search memos",
    "Search stored memos through the Personal API.",
    searchMemosSchema
  );

  registerPersonalApiTool(
    server,
    client,
    "add_transaction",
    "Add transaction",
    "Create an income or expense record through the Personal API.",
    addTransactionSchema
  );

  registerPersonalApiTool(
    server,
    client,
    "query_transactions",
    "Query transactions",
    "Search and filter transaction records through the Personal API.",
    queryTransactionsSchema
  );

  registerPersonalApiTool(
    server,
    client,
    "monthly_finance_summary",
    "Monthly finance summary",
    "Summarize monthly income, expenses, net total, and categories through the Personal API.",
    monthlyFinanceSummarySchema
  );
}

function registerPersonalApiTool(
  server: McpServer,
  client: PersonalApiClient,
  name: string,
  title: string,
  description: string,
  inputSchema: Record<string, z.ZodType>
): void {
  server.registerTool(
    name,
    {
      title,
      description,
      inputSchema
    },
    async (args) => {
      try {
        const result = await client.postTool(name, args as ToolPayload);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2)
            }
          ],
          structuredContent: isObject(result) ? result : { result }
        };
      } catch (error) {
        const message =
          error instanceof PersonalApiError
            ? formatPersonalApiError(error)
            : error instanceof Error
              ? error.message
              : "Unknown tool failure.";

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: message
            }
          ]
        };
      }
    }
  );
}

function formatPersonalApiError(error: PersonalApiError): string {
  const details =
    error.responseBody === undefined ? "" : `\n${JSON.stringify(error.responseBody, null, 2)}`;
  return `${error.message}${details}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
