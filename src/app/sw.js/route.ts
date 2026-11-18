import { generateServiceWorkerScript, resolveBuildId } from "@/lib/pwa";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const buildId =
    process.env.NODE_ENV === "development" ? "dev" : resolveBuildId();
  const body = generateServiceWorkerScript(buildId);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
