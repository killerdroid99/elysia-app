import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./src/db";

async function migrateData() {
  await migrate(db, { migrationsFolder: "./drizzle" });
  process.exit(0);
}

migrateData().catch((err) => {
  console.error(err);
  process.exit(0);
});
