import { ZodError } from "zod";
import { ApiError } from "./client";

export function getApiErrorMessage(error: unknown) {
  if (error instanceof ZodError)
    return "We couldn’t load this information. Please try again. If the problem continues, contact support.";
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "The request could not be completed.";
}
