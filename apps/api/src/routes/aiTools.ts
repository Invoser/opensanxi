import { AuditAction, Prisma, TransactionType } from "@prisma/client";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { actorFromHeaders, recordAuditEvent } from "../audit.js";
import { config } from "../config.js";
import { prisma } from "../prisma.js";
import { parseInput } from "../validation.js";

const aiToolSchema = z.object({
  tool: z.enum(["memo.search", "memo.create", "transaction.create", "transaction.summary", "webhook.forward"]),
  input: z.record(z.unknown()).default({})
});

const memoSearchInputSchema = z.object({
  q: z.string().trim().optional(),
  query: z.string().trim().optional(),
  tag: z.string().trim().optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5)
});

const memoCreateInputSchema = z.object({
  title: z.string().trim().min(1).optional(),
  content: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).default([])
});

const transactionCreateInputSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE", "income", "expense"]),
  amount: z.coerce.number().positive(),
  currency: z.string().trim().length(3).default("CNY").transform((value) => value.toUpperCase()),
  category: z.string().trim().min(1),
  description: z.string().trim().optional(),
  note: z.string().trim().optional(),
  merchant: z.string().trim().optional(),
  occurredAt: z.coerce.date().optional(),
  occurred_at: z.coerce.date().optional()
});

const transactionSummaryInputSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  currency: z.string().trim().length(3).optional().transform((value) => value?.toUpperCase())
});

const transactionQueryInputSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE", "income", "expense"]).optional(),
  query: z.string().trim().optional(),
  category: z.string().trim().optional(),
  merchant: z.string().trim().optional(),
  currency: z.string().trim().length(3).optional().transform((value) => value?.toUpperCase()),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0)
});

const webhookInputSchema = z.record(z.unknown());

export const aiToolRoutes: FastifyPluginAsync = async (app) => {
  app.post("/ai/tools", async (request, reply) => {
    const payload = parseInput(aiToolSchema, request.body);
    const actor = actorFromHeaders(request.headers);

    let result: unknown;

    if (payload.tool === "memo.search") {
      const input = parseInput(memoSearchInputSchema, payload.input);
      result = await prisma.memo.findMany({
        where: {
          archived: false,
          ...(input.tag ? { tags: { has: input.tag } } : {}),
          ...(input.q
            ? {
                OR: [
                  { title: { contains: input.q, mode: "insensitive" } },
                  { content: { contains: input.q, mode: "insensitive" } }
                ]
              }
            : {})
        },
        orderBy: { updatedAt: "desc" },
        take: input.limit
      });
    }

    if (payload.tool === "memo.create") {
      const input = parseInput(memoCreateInputSchema, payload.input);
      result = await prisma.memo.create({
        data: {
          title: input.title ?? input.content.slice(0, 80),
          content: input.content,
          tags: input.tags
        }
      });
    }

    if (payload.tool === "transaction.create") {
      const input = parseInput(transactionCreateInputSchema, payload.input);
      const type = normalizeTransactionType(input.type);
      const description = input.description ?? ([input.merchant, input.note].filter(Boolean).join(" - ") || undefined);
      result = await prisma.transaction.create({
        data: {
          type,
          amount: input.amount,
          currency: input.currency,
          category: input.category,
          description,
          occurredAt: input.occurredAt ?? input.occurred_at ?? new Date()
        }
      });
    }

    if (payload.tool === "transaction.summary") {
      const input = parseInput(transactionSummaryInputSchema, payload.input);
      const where = {
        ...(input.currency ? { currency: input.currency } : {}),
        ...(input.from || input.to
          ? {
              occurredAt: {
                ...(input.from ? { gte: input.from } : {}),
                ...(input.to ? { lte: input.to } : {})
              }
            }
          : {})
      };
      const groups = await prisma.transaction.groupBy({
        by: ["type", "currency"],
        where,
        _sum: { amount: true },
        _count: true,
        orderBy: [{ type: "asc" }, { currency: "asc" }]
      });
      result = groups.map((group) => ({
        type: group.type,
        currency: group.currency,
        total: Number(group._sum.amount ?? 0),
        count: group._count
      }));
    }

    if (payload.tool === "webhook.forward") {
      if (!config.aiWebhookUrl) {
        return reply.badRequest("AI_WEBHOOK_URL is not configured");
      }

      const input = parseInput(webhookInputSchema, payload.input);
      const webhookResponse = await fetch(config.aiWebhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(config.aiWebhookToken ? { authorization: `Bearer ${config.aiWebhookToken}` } : {})
        },
        body: JSON.stringify(input)
      });

      result = {
        status: webhookResponse.status,
        ok: webhookResponse.ok,
        body: await webhookResponse.text()
      };
    }

    await recordAuditEvent({
      action: AuditAction.TOOL_CALL,
      entity: "AiTool",
      actor,
      metadata: { tool: payload.tool, input: payload.input ?? {} } as Prisma.InputJsonObject
    });

    return { tool: payload.tool, result };
  });

  app.post("/ai/tools/add_memo", async (request, reply) => {
    const input = parseInput(memoCreateInputSchema, request.body);
    const memo = await prisma.memo.create({
      data: {
        title: input.title ?? input.content.slice(0, 80),
        content: input.content,
        tags: input.tags
      }
    });

    await recordToolAudit(request, "add_memo", input);
    return reply.status(201).send({ ok: true, memo });
  });

  app.post("/ai/tools/search_memos", async (request) => {
    const input = parseInput(memoSearchInputSchema, request.body);
    const query = input.query ?? input.q;
    const tag = input.tag ?? input.tags?.[0];
    const memos = await prisma.memo.findMany({
      where: {
        archived: false,
        ...(tag ? { tags: { has: tag } } : {}),
        ...(query
          ? {
              OR: [
                { title: { contains: query, mode: "insensitive" } },
                { content: { contains: query, mode: "insensitive" } }
              ]
            }
          : {})
      },
      orderBy: { updatedAt: "desc" },
      take: input.limit
    });

    await recordToolAudit(request, "search_memos", input);
    return { ok: true, memos };
  });

  app.post("/ai/tools/add_transaction", async (request, reply) => {
    const input = parseInput(transactionCreateInputSchema, request.body);
    const type = normalizeTransactionType(input.type);
    const occurredAt = input.occurredAt ?? input.occurred_at ?? new Date();
    const description = input.description ?? ([input.merchant, input.note].filter(Boolean).join(" - ") || undefined);
    const transaction = await prisma.transaction.create({
      data: {
        type,
        amount: input.amount,
        currency: input.currency,
        category: input.category,
        description,
        occurredAt
      }
    });

    await recordToolAudit(request, "add_transaction", input);
    return reply.status(201).send({ ok: true, transaction });
  });

  app.post("/ai/tools/query_transactions", async (request) => {
    const input = parseInput(transactionQueryInputSchema, request.body);
    const type = input.type ? normalizeTransactionType(input.type) : undefined;
    const where = {
      ...(type ? { type } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.currency ? { currency: input.currency } : {}),
      ...(input.query || input.merchant
        ? {
            OR: [
              { description: { contains: input.query ?? input.merchant ?? "", mode: "insensitive" as const } },
              { category: { contains: input.query ?? input.merchant ?? "", mode: "insensitive" as const } }
            ]
          }
        : {}),
      ...(input.from || input.to
        ? {
            occurredAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {})
            }
          }
        : {})
    };
    const [transactions, total] = await prisma.$transaction([
      prisma.transaction.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        take: input.limit,
        skip: input.offset
      }),
      prisma.transaction.count({ where })
    ]);

    await recordToolAudit(request, "query_transactions", input);
    return { ok: true, transactions, total, limit: input.limit, offset: input.offset };
  });

  app.post("/ai/tools/monthly_finance_summary", async (request) => {
    const input = parseInput(transactionSummaryInputSchema, request.body);
    const range = input.month ? monthRange(input.month) : { from: input.from, to: input.to };
    const where = {
      ...(input.currency ? { currency: input.currency } : {}),
      ...(range.from || range.to
        ? {
            occurredAt: {
              ...(range.from ? { gte: range.from } : {}),
              ...(range.to ? { lt: range.to } : {})
            }
          }
        : {})
    };

    const [income, expense, byCategory] = await prisma.$transaction([
      prisma.transaction.aggregate({
        where: { ...where, type: TransactionType.INCOME },
        _sum: { amount: true },
        _count: true
      }),
      prisma.transaction.aggregate({
        where: { ...where, type: TransactionType.EXPENSE },
        _sum: { amount: true },
        _count: true
      }),
      prisma.transaction.groupBy({
        by: ["category", "type", "currency"],
        where,
        _sum: { amount: true },
        _count: true,
        orderBy: [{ category: "asc" }, { type: "asc" }]
      })
    ]);

    const incomeTotal = Number(income._sum.amount ?? 0);
    const expenseTotal = Number(expense._sum.amount ?? 0);
    await recordToolAudit(request, "monthly_finance_summary", input);
    return {
      ok: true,
      month: input.month,
      income_total: incomeTotal,
      expense_total: expenseTotal,
      net: incomeTotal - expenseTotal,
      currency: input.currency ?? "mixed",
      by_category: byCategory.map((row) => ({
        category: row.category,
        type: row.type,
        currency: row.currency,
        amount: Number(row._sum?.amount ?? 0),
        count: row._count
      }))
    };
  });
};

async function recordToolAudit(request: FastifyRequest, tool: string, input: unknown) {
  await recordAuditEvent({
    action: AuditAction.TOOL_CALL,
    entity: "AiTool",
    actor: actorFromHeaders(request.headers),
    metadata: { tool, input } as Prisma.InputJsonObject
  });
}

function monthRange(month: string): { from: Date; to: Date } {
  const [year, monthNumber] = month.split("-").map(Number);
  const from = new Date(Date.UTC(year, monthNumber - 1, 1));
  const to = new Date(Date.UTC(year, monthNumber, 1));
  return { from, to };
}

function normalizeTransactionType(value: "INCOME" | "EXPENSE" | "income" | "expense"): TransactionType {
  return value.toUpperCase() === "INCOME" ? TransactionType.INCOME : TransactionType.EXPENSE;
}
