import { AuditAction, TransactionType } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { actorFromHeaders, recordAuditEvent } from "../audit.js";
import { prisma } from "../prisma.js";
import { parseInput } from "../validation.js";

const transactionTypeSchema = z.nativeEnum(TransactionType);

const transactionCreateSchema = z.object({
  type: transactionTypeSchema,
  amount: z.coerce.number().positive(),
  currency: z.string().trim().length(3).default("USD").transform((value) => value.toUpperCase()),
  category: z.string().trim().min(1),
  description: z.string().trim().optional(),
  occurredAt: z.coerce.date()
});

const transactionUpdateSchema = transactionCreateSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field is required" }
);

const transactionListQuerySchema = z.object({
  type: transactionTypeSchema.optional(),
  category: z.string().trim().optional(),
  currency: z.string().trim().length(3).optional().transform((value) => value?.toUpperCase()),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0)
});

const summaryQuerySchema = transactionListQuerySchema.omit({ limit: true, offset: true });

const idParamSchema = z.object({
  id: z.string().uuid()
});

const buildWhere = (query: z.infer<typeof summaryQuerySchema>) => ({
  ...(query.type ? { type: query.type } : {}),
  ...(query.category ? { category: query.category } : {}),
  ...(query.currency ? { currency: query.currency } : {}),
  ...(query.from || query.to
    ? {
        occurredAt: {
          ...(query.from ? { gte: query.from } : {}),
          ...(query.to ? { lte: query.to } : {})
        }
      }
    : {})
});

export const transactionRoutes: FastifyPluginAsync = async (app) => {
  app.get("/transactions", async (request) => {
    const query = parseInput(transactionListQuerySchema, request.query);
    const where = buildWhere(query);
    const [items, total] = await prisma.$transaction([
      prisma.transaction.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        take: query.limit,
        skip: query.offset
      }),
      prisma.transaction.count({ where })
    ]);
    return { items, total, limit: query.limit, offset: query.offset };
  });

  app.get("/transactions/summary", async (request) => {
    const query = parseInput(summaryQuerySchema, request.query);
    const where = buildWhere(query);

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

    await recordAuditEvent({
      action: AuditAction.READ,
      entity: "TransactionSummary",
      actor: actorFromHeaders(request.headers),
      metadata: {
        type: query.type ?? null,
        category: query.category ?? null,
        currency: query.currency ?? null,
        from: query.from?.toISOString() ?? null,
        to: query.to?.toISOString() ?? null
      }
    });

    const incomeTotal = Number(income._sum.amount ?? 0);
    const expenseTotal = Number(expense._sum.amount ?? 0);

    return {
      income: { total: incomeTotal, count: income._count },
      expense: { total: expenseTotal, count: expense._count },
      net: incomeTotal - expenseTotal,
      byCategory: byCategory.map((row) => ({
        category: row.category,
        type: row.type,
        currency: row.currency,
        total: Number(row._sum?.amount ?? 0),
        count: row._count
      }))
    };
  });

  app.get("/transactions/:id", async (request, reply) => {
    const { id } = parseInput(idParamSchema, request.params);
    const transaction = await prisma.transaction.findUnique({ where: { id } });
    if (!transaction) {
      return reply.notFound("Transaction not found");
    }
    return transaction;
  });

  app.post("/transactions", async (request, reply) => {
    const input = parseInput(transactionCreateSchema, request.body);
    const transaction = await prisma.transaction.create({ data: input });
    await recordAuditEvent({
      action: AuditAction.CREATE,
      entity: "Transaction",
      entityId: transaction.id,
      actor: actorFromHeaders(request.headers),
      metadata: {
        type: transaction.type,
        amount: transaction.amount.toString(),
        currency: transaction.currency,
        category: transaction.category
      }
    });
    return reply.status(201).send(transaction);
  });

  app.patch("/transactions/:id", async (request, reply) => {
    const { id } = parseInput(idParamSchema, request.params);
    const input = parseInput(transactionUpdateSchema, request.body);
    try {
      const transaction = await prisma.transaction.update({ where: { id }, data: input });
      await recordAuditEvent({
        action: AuditAction.UPDATE,
        entity: "Transaction",
        entityId: transaction.id,
        actor: actorFromHeaders(request.headers),
        metadata: { fields: Object.keys(input) }
      });
      return transaction;
    } catch (error) {
      request.log.debug({ err: error }, "Transaction update failed");
      return reply.notFound("Transaction not found");
    }
  });

  app.delete("/transactions/:id", async (request, reply) => {
    const { id } = parseInput(idParamSchema, request.params);
    try {
      const transaction = await prisma.transaction.delete({ where: { id } });
      await recordAuditEvent({
        action: AuditAction.DELETE,
        entity: "Transaction",
        entityId: transaction.id,
        actor: actorFromHeaders(request.headers)
      });
      return reply.status(204).send();
    } catch (error) {
      request.log.debug({ err: error }, "Transaction delete failed");
      return reply.notFound("Transaction not found");
    }
  });
};
