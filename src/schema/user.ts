import { pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  name: text("name"),
  email: text("email").unique(),
  password: text("password"),
  createdAt: timestamp("created_at", {
    precision: 6,
    withTimezone: true,
    mode: "string",
  })
    .notNull()
    .defaultNow(),
});
