import { randomUUID } from "node:crypto";
import { env } from "@/env";
import { isProductionRuntime } from "@/lib/app-url";
import { logger } from "@/lib/logger";

export interface EmailSendResult {
  ok: boolean;
  mode: "resend" | "console";
  id: string | null;
  error?: string;
}

export interface SendEmailOptions {
  from?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_FROM_EMAIL = "Wafrah <notifications@wafrah.sa>";
const RESEND_API_ENDPOINT = "https://api.resend.com/emails";
const PLACEHOLDER_API_KEY = "re_replace_with_api_key";

function resolveApiKey(explicitKey?: string): string {
  const key = (explicitKey ?? env.RESEND_API_KEY ?? "").trim();
  if (!key || key === PLACEHOLDER_API_KEY) {
    return "";
  }
  return key;
}

/**
 * Thin Resend email wrapper. Sends via Resend HTTP API when `RESEND_API_KEY`
 * is configured, and logs formatted email previews to console in dev/test when missing.
 */
export async function sendEmail(
  to: string | string[],
  subject: string,
  html: string,
  text: string,
  options?: SendEmailOptions,
): Promise<EmailSendResult> {
  const recipients = (Array.isArray(to) ? to : [to])
    .map((addr) => addr.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    return {
      ok: false,
      mode: "console",
      id: null,
      error: "No valid email recipients provided",
    };
  }

  const from = (
    options?.from ??
    env.EMAIL_FROM ??
    DEFAULT_FROM_EMAIL
  ).trim();
  const apiKey = resolveApiKey(options?.apiKey);

  if (!apiKey) {
    if (isProductionRuntime() && env.VERCEL_ENV !== "preview") {
      logger.error("email.resend_key_missing", {
        subject,
        recipientCount: recipients.length,
      });
      return {
        ok: false,
        mode: "console",
        id: null,
        error: "RESEND_API_KEY is not configured in production",
      };
    }

    const devId = `dev-console-${randomUUID().slice(0, 8)}`;
    logger.info("email.dev_preview", {
      tag: "[WAFRAH DEV EMAIL]",
      id: devId,
      from,
      to: recipients,
      subject,
      preview: text,
      htmlLength: html.length,
    });

    return { ok: true, mode: "console", id: devId };
  }

  const fetchImpl = options?.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(RESEND_API_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      logger.error("email.resend_http_error", {
        status: response.status,
        subject,
        error: errorText,
      });
      return {
        ok: false,
        mode: "resend",
        id: null,
        error: `Resend HTTP ${response.status}${errorText ? `: ${errorText}` : ""}`,
      };
    }

    const data = (await response.json().catch(() => ({}))) as { id?: string };
    return {
      ok: true,
      mode: "resend",
      id: data.id ?? null,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("email.resend_network_error", { subject, error });
    return {
      ok: false,
      mode: "resend",
      id: null,
      error: msg,
    };
  }
}
