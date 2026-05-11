import { AuditAction } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { actorFromHeaders, recordAuditEvent } from "../audit.js";
import { prisma } from "../prisma.js";
import { parseInput } from "../validation.js";

const memoCreateSchema = z.object({
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).default([]),
  archived: z.boolean().default(false)
});

const memoUpdateSchema = memoCreateSchema.partial().refine((data) => Object.keys(data).length > 0, {
  message: "At least one field is required"
});

const memoListQuerySchema = z.object({
  q: z.string().trim().optional(),
  tag: z.string().trim().optional(),
  archived: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0)
});

const idParamSchema = z.object({
  id: z.string().uuid()
});

export const memoRoutes: FastifyPluginAsync = async (app) => {
  app.get("/memos", async (request) => {
    const query = parseInput(memoListQuerySchema, request.query);
    const where = {
      ...(query.archived === undefined ? {} : { archived: query.archived }),
      ...(query.tag ? { tags: { has: query.tag } } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: "insensitive" as const } },
              { content: { contains: query.q, mode: "insensitive" as const } }
            ]
          }
        : {})
    };

    const [items, total] = await prisma.$transaction([
      prisma.memo.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: query.limit,
        skip: query.offset
      }),
      prisma.memo.count({ where })
    ]);

    if (query.q || query.tag) {
      await recordAuditEvent({
        action: AuditAction.SEARCH,
        entity: "Memo",
        actor: actorFromHeaders(request.headers),
        metadata: { q: query.q ?? null, tag: query.tag ?? null }
      });
    }

    return { items, total, limit: query.limit, offset: query.offset };
  });

  app.get("/memos/:id", async (request, reply) => {
    const { id } = parseInput(idParamSchema, request.params);
    const memo = await prisma.memo.findUnique({ where: { id } });
    if (!memo) {
      return reply.notFound("Memo not found");
    }
    return memo;
  });

  app.post("/memos", async (request, reply) => {
    const input = parseInput(memoCreateSchema, request.body);
    const memo = await prisma.memo.create({ data: input });
    await recordAuditEvent({
      action: AuditAction.CREATE,
      entity: "Memo",
      entityId: memo.id,
      actor: actorFromHeaders(request.headers),
      metadata: { title: memo.title, tags: memo.tags }
    });
    return reply.status(201).send(memo);
  });

  app.patch("/memos/:id", async (request, reply) => {
    const { id } = parseInput(idParamSchema, request.params);
    const input = parseInput(memoUpdateSchema, request.body);
    try {
      const memo = await prisma.memo.update({ where: { id }, data: input });
      await recordAuditEvent({
        action: AuditAction.UPDATE,
        entity: "Memo",
        entityId: memo.id,
        actor: actorFromHeaders(request.headers),
        metadata: { fields: Object.keys(input) }
      });
      return memo;
    } catch (error) {
      request.log.debug({ err: error }, "Memo update failed");
      return reply.notFound("Memo not found");
    }
  });

  app.delete("/memos/:id", async (request, reply) => {
    const { id } = parseInput(idParamSchema, request.params);
    try {
      const memo = await prisma.memo.delete({ where: { id } });
      await recordAuditEvent({
        action: AuditAction.DELETE,
        entity: "Memo",
        entityId: memo.id,
        actor: actorFromHeaders(request.headers)
      });
      return reply.status(204).send();
    } catch (error) {
      request.log.debug({ err: error }, "Memo delete failed");
      return reply.notFound("Memo not found");
    }
  });
};
