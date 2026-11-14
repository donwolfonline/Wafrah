import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

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

/**
 * Extracts cron credentials from either Vercel Cron's `Authorization: Bearer <token>`
 * header or a manual `x-cron-secret` header.
 */
export function extractCronSecret(request: Request): string | null {
  const authorization = request.headers.get("authorization")?.trim();
  if (authorization) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (match?.[1]) {
      return match[1].trim();
    }
    return null;
  }

  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  return headerSecret || null;
}

export function verifyCronSecret(providedSecret: string | null): boolean {
  const expectedSecret = process.env.CRON_SECRET?.trim() ?? "";
  if (!expectedSecret || !providedSecret) {
    return false;
  }
  if (
    process.env.NODE_ENV === "production" &&
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
  if (!isCronAuthorized(request)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return parseCronNowBody(request);
}
