export type AppErrorCode = "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "RATE_LIMITED";

/**
 * An error whose message is safe to show to the user. Anything else thrown on
 * the server is treated as internal and replaced with a generic message.
 */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly fieldErrors?: Record<string, string>;

  constructor(code: AppErrorCode, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export const notFound = (what = "That item") => new AppError("NOT_FOUND", `${what} was not found or you don't have access.`);
export const forbidden = (message = "You don't have permission to do that.") => new AppError("FORBIDDEN", message);
export const invalid = (message: string, fieldErrors?: Record<string, string>) =>
  new AppError("VALIDATION", message, fieldErrors);
export const conflict = (message: string) => new AppError("CONFLICT", message);

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
