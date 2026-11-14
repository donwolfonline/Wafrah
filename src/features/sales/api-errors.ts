import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthorizationError } from "@/lib/authz";
import { TenantIsolationError } from "@/lib/tenant";
import { ImportInputError } from "./import-files";

export function handleImportRouteError(error: unknown) {
  if (error instanceof AuthorizationError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode },
    );
  }
  if (error instanceof TenantIsolationError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode },
    );
  }
  if (error instanceof ImportInputError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode },
    );
  }
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: error instanceof ZodError ? error.issues : undefined,
      },
      { status: 400 },
    );
  }
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
