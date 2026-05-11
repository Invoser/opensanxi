import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../prisma.js";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => {
    return {
      status: "ok",
      service: "personal-assistant-api",
      timestamp: new Date().toISOString()
    };
  });

  app.get("/health/db", async () => {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: "ok",
      database: "reachable",
      timestamp: new Date().toISOString()
    };
  });
};
