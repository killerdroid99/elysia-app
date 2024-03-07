CREATE TABLE IF NOT EXISTS "posts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text,
	"content" text,
	"created_at" timestamp(6) with time zone,
	"edited" boolean,
	"author_id" uuid
);
