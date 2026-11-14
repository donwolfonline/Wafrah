import { NextResponse } from "next/server";
import { handleImportRouteError } from "@/features/sales/api-errors";
import { getImportsBootstrapForTenant } from "@/features/sales/service";

export async function GET() {
  try {
    const data = await getImportsBootstrapForTenant();
    return NextResponse.json(data);
  } catch (error) {
    return handleImportRouteError(error);
  }
}
