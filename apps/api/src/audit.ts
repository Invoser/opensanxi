import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

type AuditPayload = {
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  actor?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export const recordAuditEvent = async ({
  action,
  entity,
  entityId,
  actor,
  metadata
}: AuditPayload) => {
  return prisma.auditEvent.create({
    data: {
      action,
      entity,
      entityId,
      actor,
      metadata: metadata ?? Prisma.JsonNull
    }
  });
};

export const actorFromHeaders = (headers: Record<string, unknown>): string | null => {
  const actor = headers["x-actor-id"];
  return typeof actor === "string" && actor.trim() ? actor.trim() : null;
};
