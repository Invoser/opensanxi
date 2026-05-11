import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { config } from "./config.js";
import { prisma } from "./prisma.js";
import { auditEventRoutes } from "./routes/auditEvents.js";
import { aiToolRoutes } from "./routes/aiTools.js";
import { healthRoutes } from "./routes/health.js";
import { memoRoutes } from "./routes/memos.js";
import { transactionRoutes } from "./routes/transactions.js";
import { ValidationError } from "./validation.js";

type HttpErrorLike = {
  name?: string;
  message?: string;
  statusCode?: number;
};

const asHttpError = (error: unknown): HttpErrorLike => {
  if (error && typeof error === "object") {
    return error as HttpErrorLike;
  }
  return { message: "Unexpected server error" };
};

export const buildApp = async () => {
  const app = Fastify({
    logger: {
      level: config.logLevel
    }
  });

  await app.register(cors, { origin: true });
  await app.register(sensible);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ValidationError) {
      return reply.status(400).send({
        error: "Bad Request",
        message: error.message,
        issues: error.issues
      });
    }

    request.log.error({ err: error }, "Request failed");
    const httpError = asHttpError(error);
    const statusCode =
      httpError.statusCode && httpError.statusCode >= 400 ? httpError.statusCode : 500;
    return reply.status(statusCode).send({
      error: statusCode === 500 ? "Internal Server Error" : httpError.name,
      message: statusCode === 500 ? "Unexpected server error" : httpError.message
    });
  });

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  await app.register(healthRoutes);
  await app.register(memoRoutes);
  await app.register(transactionRoutes);
  await app.register(aiToolRoutes);
  await app.register(auditEventRoutes);

  await app.register(memoRoutes, { prefix: "/api" });
  await app.register(transactionRoutes, { prefix: "/api" });
  await app.register(aiToolRoutes, { prefix: "/api" });
  await app.register(auditEventRoutes, { prefix: "/api" });

  return app;
};
