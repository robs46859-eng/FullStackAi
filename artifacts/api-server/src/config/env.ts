import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z.string().transform(Number).default("3000"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  
  // AI Provider Keys (at least one should be provided)
  AI_INTEGRATIONS_OPENAI_API_KEY: z.string().optional(),
  AI_INTEGRATIONS_OPENAI_BASE_URL: z.string().url().optional(),
  
  AI_INTEGRATIONS_ANTHROPIC_API_KEY: z.string().optional(),
  AI_INTEGRATIONS_ANTHROPIC_BASE_URL: z.string().url().optional(),
  
  AI_INTEGRATIONS_GEMINI_API_KEY: z.string().optional(),
  AI_INTEGRATIONS_GEMINI_BASE_URL: z.string().url().optional(),

  // Gateway Config
  GATEWAY_STRATEGY: z.enum(["cost", "latency", "capability"]).default("cost"),
  CANARY_PROVIDER: z.string().optional(),
  CANARY_TRAFFIC_PERCENT: z.string().transform(Number).default("0"),

  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // SurrealDB / FULL STACK tool
  SURREAL_URL: z.string().url().optional(),
  SURREAL_NS: z.string().optional(),
  SURREAL_DB: z.string().optional(),
  SURREAL_USER: z.string().optional(),
  SURREAL_PASS: z.string().optional(),
});

export const env = envSchema.parse(process.env);
