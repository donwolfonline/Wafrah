import {
  logger,
  resolveRequestId,
  runWithLogContext,
  setLogContextFields,
} from "./logger";

export { setLogContextFields };

/**
 * Wraps an HTTP Route Handler in a structured log context containing
 * `requestId` (preserving incoming `x-request-id` / `x-vercel-id` or generating
 * a UUID) and sets `x-request-id` on the response.
 */
export async function withRequestContext<T extends Response>(
  request: Request,
  handler: (requestId: string) => Promise<T>,
): Promise<T> {
  const requestId = resolveRequestId(request.headers);
  return runWithLogContext({ requestId }, async () => {
    try {
      const response = await handler(requestId);
      try {
        response.headers.set("x-request-id", requestId);
      } catch {
        // Ignore immutable response header objects
      }
      return response;
    } catch (error) {
      const pathname = (() => {
        try {
          return new URL(request.url).pathname;
        } catch {
          return "unknown";
        }
      })();
      logger.error("http.unhandled_error", {
        method: request.method,
        path: pathname,
        error,
      });
      throw error;
    }
  });
}
