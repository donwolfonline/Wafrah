import { z } from "zod";
import { handleImportRouteError } from "@/features/sales/api-errors";
import { ImportTypeSchema } from "@/features/sales/schemas";
import { buildImportTemplateCsv } from "@/features/sales/service";
import { requireRole } from "@/lib/authz";

const TemplateQuerySchema = z.object({
  type: ImportTypeSchema.default("SALES"),
  locale: z.enum(["ar", "en"]).default("ar"),
});

export async function GET(request: Request) {
  try {
    await requireRole("sales.import");
    const url = new URL(request.url);
    const { type, locale } = TemplateQuerySchema.parse({
      type: url.searchParams.get("type") ?? undefined,
      locale: url.searchParams.get("locale") ?? undefined,
    });

    const csv = buildImportTemplateCsv(type, locale);
    const filename = `wafrah-${type.toLowerCase()}-template-${locale}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleImportRouteError(error);
  }
}
