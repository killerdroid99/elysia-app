import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

const client = new pg.Client({
  host: Bun.env.HOST,
  port: 5432,
  user: Bun.env.DB_USER,
  password: Bun.env.PASSWORD,
  database: Bun.env.DB,
  ssl: false,
});

try {
  await client.connect();
  console.log("connected");
} catch (error) {
  console.error(error);
}

export const db = drizzle(client, {
  logger: true,
});
