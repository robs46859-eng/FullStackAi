import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const migrationClient = postgres(databaseUrl, { max: 1 });

async function main() {
  const db = drizzle(migrationClient, { schema });

  console.log("Running migrations...");

  await migrate(db, {
    migrationsFolder: "./migrations", // This should match your Drizzle Kit output
  });

  console.log("Migrations completed.");

  await migrationClient.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
