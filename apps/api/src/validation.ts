import type { FastifyBaseLogger } from "fastify";
import { ZodError, type ZodSchema } from "zod";

export class ValidationError extends Error {
  constructor(public readonly issues: ZodError["issues"]) {
    super("Validation failed");
  }
}

export const parseInput = <T>(schema: ZodSchema<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError(result.error.issues);
  }
  return result.data;
};

export const logUnexpectedError = (logger: FastifyBaseLogger, error: unknown): void => {
  logger.error({ err: error }, "Unexpected request error");
};
