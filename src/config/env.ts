import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(1).default('fallback-dev-secret-change-me'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  FRONTEND_URL: z.string().default('http://localhost:3001'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3001'),
  DB_POOL_SIZE: z.string().transform(Number).default('20'),
  QUERY_TIMEOUT: z.string().transform(Number).default('30000'),
  DEFAULT_PAGE_SIZE: z.string().transform(Number).default('100'),
  MAX_PAGE_SIZE: z.string().transform(Number).default('1000'),
});

export type Env = z.infer<typeof envSchema>;

let env: Env;

export function loadEnv(): Env {
  if (env) return env;

  try {
    env = envSchema.parse(process.env);

    // CRITICAL: Crash if JWT_SECRET is not set in production
    if (env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'fallback-dev-secret-change-me')) {
      throw new Error('JWT_SECRET must be set to a secure value in production');
    }

    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Invalid environment variables:');
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    }
    throw error instanceof Error ? error : new Error('Failed to load environment variables');
  }
}

export function getEnv(): Env {
  if (!env) {
    throw new Error('Environment not loaded. Call loadEnv() first.');
  }
  return env;
}
