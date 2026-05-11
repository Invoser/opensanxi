import { AuditAction } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { parseInput } from "../validation.js";

const auditEventQuerySchema = z.object({
  action: z.nativeEnum(AuditAction).optional(),
  entity: z.string().trim().optional(),
  actor: z.string().trim().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0)
});

export const auditEventRoutes: FastifyPluginAsync = async (app) => {
  app.get("/audit-events", async (request) => {
    const query = parseInput(auditEventQuerySchema, request.query);
    const where = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.actor ? { actor: query.actor } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {})
            }
          }
        : {})
    };

    const [items, total] = await prisma.$transaction([
      prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: query.limit,
        skip: query.offset
      }),
      prisma.auditEvent.count({ where })
    ]);

    return { items, total, limit: query.limit, offset: query.offset };
  });
};
