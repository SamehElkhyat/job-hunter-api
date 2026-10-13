import { Types } from "mongoose";
import type { ZodError, ZodType } from "zod";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: string[],
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} not found`);

function fromZod(error: ZodError): HttpError {
  return new HttpError(
    400,
    "Invalid request",
    error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`),
  );
}

/** Validates `data` against `schema`, throwing a 400 with readable issues. */
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw fromZod(result.error);
  return result.data;
}

/** Converts a route parameter into an ObjectId, or throws 400 (never lets a CastError reach Mongoose). */
export function toObjectId(value: unknown, label = "id"): Types.ObjectId {
  if (typeof value !== "string" || !/^[a-f0-9]{24}$/i.test(value)) {
    throw new HttpError(400, `Invalid ${label}`);
  }
  return new Types.ObjectId(value);
}
