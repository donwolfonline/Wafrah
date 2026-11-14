## Summary

<!-- Briefly describe what this PR changes and why. Link any related issue or task. -->

## Type of Change

- [ ] Feature
- [ ] Bug fix
- [ ] Database migration (`prisma/migrations/*`)
- [ ] Security / Dependency update
- [ ] Documentation / Ops

## Required Review Checklist

- [ ] **Migrations backward-compatible?** New tables/columns added first (expand-first) and breaking drops/renames deferred so the running release and rollbacks stay safe (see [docs/DB-OPS.md](docs/DB-OPS.md)); or N/A (no schema change).
- [ ] **Env vars added to docs?** Any new or changed environment variables are validated with Zod in [src/env.schema.ts](src/env.schema.ts) / [src/env.client.ts](src/env.client.ts), added to [.env.example](.env.example), and scoped cleanly in [docs/ENV.md](docs/ENV.md) and [docs/STAGING.md](docs/STAGING.md) (or N/A).
- [ ] **Tests added & passing?** Domain logic, API validation, and tenant isolation changes have Vitest coverage, and `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass.
- [ ] **RTL & i18n checked?** UI changes tested in both Arabic (`ar`, default RTL) and English (`en`, LTR), using logical Tailwind utilities (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`, `text-end`) and `next-intl` translation keys (no hardcoded UI text).
- [ ] **Multi-tenancy & staging hygiene:** All tenant queries route through `getTenantDb` / `getPlatformAdminDb`; no production secrets, `CRON_SECRET`, live `RESEND_API_KEY`, or demo data rules violated.
