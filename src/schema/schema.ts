import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core";

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
    .defaultNow()
    .notNull()
    .defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const posts = pgTable("posts", {
  id: uuid("id").primaryKey(),
  title: text("title"),
  content: text("content"),
  createdAt: timestamp("created_at", {
    precision: 6,
    withTimezone: true,
    mode: "string",
  }).defaultNow(),
  edited: boolean("edited").default(false),
  authorId: uuid("author_id"),
});

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
}));
