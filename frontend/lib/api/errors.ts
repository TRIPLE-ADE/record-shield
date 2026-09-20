import { ApiError } from "./client";

export function getApiErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "The request could not be completed.";
}
