import { AuditAction, Prisma, TransactionType } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { actorFromHeaders, recordAuditEvent } from "../audit.js";
import { prisma } from "../prisma.js";
import { parseInput } from "../validation.js";

const backupFormatVersion = 1;

const memoBackupSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).default([]),
  archived: z.boolean().default(false),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

const transactionBackupSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(TransactionType),
  amount: z.coerce.number().positive(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  category: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  occurredAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

const backupImportSchema = z.object({
  app: z.literal("opensanxi").optional(),
  formatVersion: z.literal(backupFormatVersion),
  exportedAt: z.coerce.date().optional(),
  data: z.object({
    memos: z.array(memoBackupSchema).default([]),
    transactions: z.array(transactionBackupSchema).default([])
  })
});

const restoreOptionsSchema = z.object({
  mode: z.enum(["merge", "replace"]).default("merge"),
  backup: backupImportSchema
});

export const backupRoutes: FastifyPluginAsync = async (app) => {
  app.get("/backups/export", async (request, reply) => {
    const [memos, transactions] = await prisma.$transaction([
      prisma.memo.findMany({ orderBy: { updatedAt: "desc" } }),
      prisma.transaction.findMany({ orderBy: { occurredAt: "desc" } })
    ]);

    const exportedAt = new Date().toISOString();
    const backup = {
      app: "opensanxi",
      formatVersion: backupFormatVersion,
      exportedAt,
      data: {
        memos,
        transactions: transactions.map((transaction) => ({
          ...transaction,
          amount: Number(transaction.amount)
        }))
      }
    };

    await recordAuditEvent({
      action: AuditAction.READ,
      entity: "Backup",
      actor: actorFromHeaders(request.headers),
      metadata: {
        exportedAt,
        memoCount: memos.length,
        transactionCount: transactions.length
      }
    });

    return reply
      .header("Content-Type", "application/json; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="opensanxi-backup-${exportedAt.slice(0, 10)}.json"`)
      .send(JSON.stringify(backup, null, 2));
  });

  app.post("/backups/restore", async (request) => {
    const input = parseInput(restoreOptionsSchema, request.body);
    const now = new Date();
    const memos = input.backup.data.memos ?? [];
    const transactions = input.backup.data.transactions ?? [];

    const result = await prisma.$transaction(async (tx) => {
      if (input.mode === "replace") {
        await tx.transaction.deleteMany();
        await tx.memo.deleteMany();
      }

      for (const memo of memos) {
        await tx.memo.upsert({
          where: { id: memo.id },
          update: {
            title: memo.title,
            content: memo.content,
            tags: memo.tags,
            archived: memo.archived,
            createdAt: memo.createdAt,
            updatedAt: memo.updatedAt
          },
          create: memo
        });
      }

      for (const transaction of transactions) {
        await tx.transaction.upsert({
          where: { id: transaction.id },
          update: {
            type: transaction.type,
            amount: new Prisma.Decimal(transaction.amount),
            currency: transaction.currency,
            category: transaction.category,
            description: transaction.description ?? null,
            occurredAt: transaction.occurredAt,
            createdAt: transaction.createdAt,
            updatedAt: transaction.updatedAt
          },
          create: {
            ...transaction,
            description: transaction.description ?? null,
            amount: new Prisma.Decimal(transaction.amount)
          }
        });
      }

      return {
        restoredAt: now.toISOString(),
        mode: input.mode,
        memoCount: memos.length,
        transactionCount: transactions.length
      };
    });

    await recordAuditEvent({
      action: AuditAction.UPDATE,
      entity: "Backup",
      actor: actorFromHeaders(request.headers),
      metadata: result
    });

    return { ok: true, ...result };
  });
};
