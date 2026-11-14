import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env";
import { logger } from "@/lib/logger";

const CronNowBodySchema = z.object({
  now: z.string().datetime().optional(),
});

const CronNowQuerySchema = z.object({
  now: z.string().datetime().optional(),
});

const PLACEHOLDER_CRON_SECRET = "replace-with-cron-secret";

function sha256Digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function getSafeRequestPath(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "unknown";
  }
}

/**
 * Extracts Vercel Cron or manual caller credentials strictly from the
 * `Authorization: Bearer <token>` header.
 */
export function extractCronSecret(request: Request): string | null {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match?.[1]) {
    return null;
  }

  return match[1].trim() || null;
}

export function verifyCronSecret(providedSecret: string | null): boolean {
  const expectedSecret = env.CRON_SECRET?.trim() ?? "";
  if (!expectedSecret || !providedSecret) {
    return false;
  }
  if (
    env.NODE_ENV === "production" &&
    expectedSecret === PLACEHOLDER_CRON_SECRET
  ) {
    return false;
  }

  return timingSafeEqual(
    sha256Digest(providedSecret),
    sha256Digest(expectedSecret),
  );
}

export function isCronAuthorized(request: Request): boolean {
  return verifyCronSecret(extractCronSecret(request));
}

/**
 * Enforces cron Bearer authentication. Returns 500 (never running unauthenticated)
 * if CRON_SECRET is unset or placeholder in production, and 401 with no details
 * if the Bearer token is missing or invalid.
 */
export function authorizeCronRequest(
  request: Request,
): { ok: true } | { ok: false; response: NextResponse } {
  const expectedSecret = env.CRON_SECRET?.trim() ?? "";
  if (!expectedSecret) {
    logger.error("cron.auth.secret_unset", {
      path: getSafeRequestPath(request),
      message: "CRON_SECRET is unset; refusing cron/health-deep request",
    });
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      ),
    };
  }

  if (
    env.NODE_ENV === "production" &&
    expectedSecret === PLACEHOLDER_CRON_SECRET
  ) {
    logger.error("cron.auth.secret_placeholder", {
      path: getSafeRequestPath(request),
      message: "CRON_SECRET uses placeholder value in production",
    });
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      ),
    };
  }

  const providedSecret = extractCronSecret(request);
  if (!providedSecret) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const isMatch = timingSafeEqual(
    sha256Digest(providedSecret),
    sha256Digest(expectedSecret),
  );
  if (!isMatch) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true };
}

export async function parseCronJsonBody<TSchema extends z.ZodTypeAny>(
  request: Request,
  schema: TSchema,
): Promise<
  | { ok: true; data: z.infer<TSchema> }
  | { ok: false; response: NextResponse }
> {
  const rawBody = await request.text();
  let parsedJson: unknown = {};
  if (rawBody.trim()) {
    try {
      parsedJson = JSON.parse(rawBody);
    } catch {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Invalid JSON payload" },
          { status: 400 },
        ),
      };
    }
  }

  const parsed = schema.safeParse(parsedJson);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Invalid request payload",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      ),
    };
  }

  return { ok: true, data: parsed.data };
}

export async function parseCronNowBody(
  request: Request,
): Promise<
  | { ok: true; now: Date }
  | { ok: false; response: NextResponse }
> {
  if (request.method === "GET" || request.method === "HEAD") {
    const url = new URL(request.url);
    const rawNow = url.searchParams.get("now") ?? undefined;
    const parsedQuery = CronNowQuerySchema.safeParse({ now: rawNow });
    if (!parsedQuery.success) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "Invalid request query",
            details: parsedQuery.error.flatten(),
          },
          { status: 400 },
        ),
      };
    }
    return {
      ok: true,
      now: parsedQuery.data.now ? new Date(parsedQuery.data.now) : new Date(),
    };
  }

  const parsed = await parseCronJsonBody(request, CronNowBodySchema);
  if (!parsed.ok) {
    return parsed;
  }

  return {
    ok: true,
    now: parsed.data.now ? new Date(parsed.data.now) : new Date(),
  };
}

export async function requireCronNow(
  request: Request,
): Promise<
  | { ok: true; now: Date }
  | { ok: false; response: NextResponse }
> {
  const auth = authorizeCronRequest(request);
  if (!auth.ok) {
    return auth;
  }

  return parseCronNowBody(request);
}
