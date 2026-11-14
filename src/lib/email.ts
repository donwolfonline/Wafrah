import { randomUUID } from "node:crypto";

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
  const key = (explicitKey ?? process.env.RESEND_API_KEY ?? "").trim();
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
    process.env.EMAIL_FROM ??
    DEFAULT_FROM_EMAIL
  ).trim();
  const apiKey = resolveApiKey(options?.apiKey);

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        `[email] RESEND_API_KEY missing in production; skipped "${subject}" to ${recipients.join(", ")}`,
      );
      return {
        ok: false,
        mode: "console",
        id: null,
        error: "RESEND_API_KEY is not configured in production",
      };
    }

    const devId = `dev-console-${randomUUID().slice(0, 8)}`;
    console.info(
      [
        "================================================================",
        `[WAFRAH DEV EMAIL] id=${devId}`,
        `From:    ${from}`,
        `To:      ${recipients.join(", ")}`,
        `Subject: ${subject}`,
        "----------------------------------------------------------------",
        text,
        "----------------------------------------------------------------",
        `HTML length: ${html.length} chars`,
        "================================================================",
      ].join("\n"),
    );

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
      console.error(
        `[email] Resend HTTP ${response.status} sending "${subject}": ${errorText}`,
      );
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
    console.error(`[email] Resend network error sending "${subject}": ${msg}`);
    return {
      ok: false,
      mode: "resend",
      id: null,
      error: msg,
    };
  }
}
