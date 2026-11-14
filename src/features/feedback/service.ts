import { requireRole, type SessionUser } from "@/lib/authz";
import { platformAdminDb } from "@/lib/db";
import { getTenantDb } from "@/lib/tenant";
import {
  FeedbackServiceError,
  type FeedbackSummaryDto,
  submitFeedbackSchema,
} from "./schemas";

function sanitizeFeedbackPage(rawPage: string): string {
  const trimmed = rawPage.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      return `${parsed.pathname}${parsed.search}`.slice(0, 160) || "/";
    } catch {
      return "/";
    }
  }
  return trimmed.startsWith("/") ? trimmed.slice(0, 160) : `/${trimmed}`.slice(0, 160);
}

/**
 * Persists authenticated user feedback scoped strictly to the session user's
 * server-resolved tenantId (null only for PLATFORM_ADMIN).
 */
export async function submitFeedback(
  sessionOverride: SessionUser | null | undefined,
  rawInput: unknown,
): Promise<FeedbackSummaryDto> {
  const user = await requireRole(
    ["STAFF", "MANAGER", "OWNER", "PLATFORM_ADMIN"],
    sessionOverride,
  );

  const parsed = submitFeedbackSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new FeedbackServiceError(
      parsed.error.issues[0]?.message ?? "Invalid feedback payload",
      400,
    );
  }

  const cleanPage = sanitizeFeedbackPage(parsed.data.page);

  if (user.tenantId) {
    const db = await getTenantDb(user);
    const created = await db.feedback.create({
      data: {
        tenantId: user.tenantId,
        userId: user.userId,
        page: cleanPage,
        rating: parsed.data.rating,
        message: parsed.data.message,
      },
      select: {
        id: true,
        page: true,
        rating: true,
        message: true,
        createdAt: true,
      },
    });
    return {
      ...created,
      createdAt: created.createdAt.toISOString(),
    };
  }

  if (user.role !== "PLATFORM_ADMIN") {
    throw new FeedbackServiceError("Invalid session tenant context", 403);
  }

  const created = await platformAdminDb.feedback.create({
    data: {
      tenantId: null,
      userId: user.userId,
      page: cleanPage,
      rating: parsed.data.rating,
      message: parsed.data.message,
    },
    select: {
      id: true,
      page: true,
      rating: true,
      message: true,
      createdAt: true,
    },
  });

  return {
    ...created,
    createdAt: created.createdAt.toISOString(),
  };
}
