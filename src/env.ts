import {
  ClientEnvSchema,
  type ClientEnv,
  EnvSchema,
  type EnvRuntimeMode,
  type ServerEnv,
  ServerEnvSchema,
  type ValidatedEnv,
  clientEnv,
  isVitestRuntime,
  parseClientEnv,
  parseNextConfigEnv,
  parseSeedCliEnv,
  parseServerEnv,
  parseVitestLiveEnv,
  readRawProcessEnv,
  readRuntimeFlags,
  readToolingEnv,
  resolveEnvMode,
  validateEnv,
  validateMigrationEnv,
} from "./env.core";

export {
  ClientEnvSchema,
  EnvSchema,
  ServerEnvSchema,
  clientEnv,
  parseClientEnv,
  parseNextConfigEnv,
  parseSeedCliEnv,
  parseServerEnv,
  readRuntimeFlags,
  readToolingEnv,
  resolveEnvMode,
  validateEnv,
  validateMigrationEnv,
  type ClientEnv,
  type EnvRuntimeMode,
  type ServerEnv,
  type ValidatedEnv,
};

if (typeof window !== "undefined" && !isVitestRuntime()) {
  throw new Error(
    "src/env.ts contains server-only environment configuration and cannot be imported in client components. Use src/env.client.ts instead.",
  );
}

const cachedEnv: ValidatedEnv | null = isVitestRuntime()
  ? null
  : validateEnv(readRawProcessEnv());

export const env: ValidatedEnv = new Proxy({} as ValidatedEnv, {
  get(_target, prop) {
    if (typeof prop !== "string") {
      return undefined;
    }
    const resolved = cachedEnv ?? parseVitestLiveEnv(readRawProcessEnv());
    return resolved[prop as keyof ValidatedEnv];
  },
  has(_target, prop) {
    return typeof prop === "string" && prop in EnvSchema.shape;
  },
  ownKeys() {
    return Object.keys(EnvSchema.shape);
  },
  getOwnPropertyDescriptor(_target, prop) {
    if (typeof prop === "string" && prop in EnvSchema.shape) {
      return {
        enumerable: true,
        configurable: true,
        writable: false,
        value: env[prop as keyof ValidatedEnv],
      };
    }
    return undefined;
  },
});

export const serverEnv: ServerEnv = env;
