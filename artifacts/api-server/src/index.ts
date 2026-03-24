import app from "./app";
import { logger } from "./lib/logger";
import { initRedis } from "./lib/redis";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function initStripe() {
  try {
    const { runMigrations } = await import("stripe-replit-sync");
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL required");

    // 1. Create stripe schema and tables (idempotent)
    await runMigrations({ databaseUrl });

    // 2. Get StripeSync instance (AFTER migrations)
    const { getStripeSync } = await import("./lib/stripeClient");
    const sync = await getStripeSync();

    // 3. Set up managed webhook
    const host = process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : `http://localhost:${port}`;
    const webhookUrl = `${host}/api/stripe/webhook`;
    await sync.findOrCreateManagedWebhook(webhookUrl);

    // 4. Sync all existing Stripe data
    await sync.syncBackfill();

    logger.info("Stripe sync initialized");
  } catch (err) {
    logger.warn({ err }, "Stripe init skipped — integration not configured");
  }
}

const server = app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  await initRedis();
  await initStripe();
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    logger.error(
      { port, err },
      "Port already in use — kill the stale process with: fuser -k <port>/tcp",
    );
  } else {
    logger.error({ err }, "Server error");
  }
  process.exit(1);
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received — shutting down gracefully");
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
});
