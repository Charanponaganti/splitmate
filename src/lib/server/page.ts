import "server-only";
import { notFound } from "next/navigation";
import { isAppError } from "@/lib/errors";

/** Renders the 404 page when a resource doesn't exist or the user can't access it. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (isAppError(error) && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")) notFound();
    throw error;
  }
}
