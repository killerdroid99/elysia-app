import { Cookie, Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { db } from "./db";
import { posts, users } from "./schema/schema";
import { v4 } from "uuid";
import { jwt } from "@elysiajs/jwt";
import { desc, eq } from "drizzle-orm";

const app = new Elysia({
  cookie: {
    path: "/",
    priority: "high",
    maxAge: 1000 * 60 * 60 * 2, // 2 hours
    httpOnly: false,
    secure: true,
    sameSite: "lax",
  },
})
  .use(
    cors({
      allowedHeaders: ["Content-Type", "Authorization"],
      origin: ["http://localhost:5173"],
      credentials: true,
    })
  )
  .use(
    jwt({
      secret: process.env.JWT_SECRET as string,
      schema: t.Object({
        loggedInUserId: t.String(),
      }),
    })
  )
  .decorate({ db });

app.get("/", (ctx) => {
  return { msg: "hello world" };
});

app
  .group(
    "/auth",
    {
      cookie: t.Cookie({
        TOKEN: t.Optional(t.String()),
      }),
    },
    (app) =>
      app
        .post(
          "/login",
          async ({ db, body: { email, password }, jwt, cookie: { TOKEN } }) => {
            if (TOKEN.get() !== undefined) {
              return { msg: "Session already exists" };
            }

            const u = await db
              .select()
              .from(users)
              .where(eq(users.email, email));

            if (u[0] === undefined) {
              return { msg: `No user with email ${email} exists` };
            }

            const { password: pwd, ...out } = u[0];

            if (
              !(await Bun.password.verify(password, u[0].password as string))
            ) {
              return { msg: "Wrong password" };
            }

            const token = await jwt.sign({ loggedInUserId: out.id });

            TOKEN.value = token;

            return { msg: "Logged in", user: out };
          },

          {
            body: t.Object({
              email: t.String(),
              password: t.String(),
            }),
          }
        )
        .post(
          "/register",
          async ({
            db,
            body: { name, email, password, loginDirectly },
            jwt,
            cookie: { TOKEN },
          }) => {
            const hashedPassword = await Bun.password.hash(password);

            const u = await db
              .insert(users)
              .values({ id: v4(), name, email, password: hashedPassword })
              .returning();
            const { password: pwd, ...out } = u[0];

            if (loginDirectly) {
              const token = await jwt.sign({ loggedInUserId: out.id });

              TOKEN.value = token;

              return { msg: "Registered and logged in", user: out };
            }

            return { msg: "Registered", user: out };
          },

          {
            body: t.Object({
              name: t.String({ minLength: 3, maxLength: 12 }),
              email: t.String({
                format: "email",
                error: "Invalid email",
                default: "",
              }),
              password: t.String({ minLength: 8 }),
              loginDirectly: t.Boolean(),
            }),
          }
        )
        .post("/logout", async ({ cookie, cookie: { TOKEN } }) => {
          if (TOKEN.get() === undefined) {
            return { msg: "No session exists" };
          }

          TOKEN.maxAge = 0;
          return { msg: "Logged out" };
        })
        .get("/me", async ({ db, jwt, cookie: { TOKEN } }) => {
          if (TOKEN.get() === undefined) {
            return { msg: "No session exists" };
          }

          const token = await jwt.verify(TOKEN.get());

          if (!token) {
            return { msg: "Invalid or expired token" };
          }

          const u = await db
            .select()
            .from(users)
            .where(eq(users.id, token.loggedInUserId));

          const { password, id, createdAt, ...out } = u[0];

          return { msg: "User exists", user: out };
        })
  )
  .group(
    "/posts",
    {
      cookie: t.Cookie({
        TOKEN: t.Optional(t.String()),
      }),
    },
    (app) =>
      app
        .get("/", async ({ db }) => {
          const p = await db
            .select({ post: posts, authorName: users.name })
            .from(posts)
            .orderBy(desc(posts.createdAt))
            .innerJoin(users, eq(posts.authorId, users.id));

          const out = p.map((p) => {
            const { authorId, ...post } = p.post;
            return { ...post, authorName: p.authorName };
          });
          return { msg: "All posts", posts: out };
        })
        .get(
          "/post/:postId",
          async ({ params: { postId }, db }) => {
            const p = await db
              .select({ post: posts, authorName: users.name })
              .from(posts)
              .where(eq(posts.id, postId))
              .innerJoin(users, eq(posts.authorId, users.id));

            if (p[0] === undefined) {
              return { msg: "Post not found" };
            }

            const { authorId, ...out } = p.map((p) => ({
              ...p.post,
              authorName: p.authorName,
            }))[0];
            return { msg: "Post found", post: out };
          },
          {
            params: t.Object({
              postId: t.String(),
            }),
          }
        )
        .post(
          "/create-post",
          async ({ db, jwt, cookie: { TOKEN }, body: { title, content } }) => {
            if (TOKEN.get() === undefined) {
              return { msg: "You are not logged in" };
            }

            const token = await jwt.verify(TOKEN.get());

            if (!token) {
              return { msg: "Unauthorized to create" };
            }

            const p = await db
              .insert(posts)
              .values({
                id: v4(),
                title,
                content,
                authorId: token.loggedInUserId,
              })
              .returning();

            const { authorId, ...out } = p[0];

            return { msg: "Post created", post: out };
          },
          {
            body: t.Object({
              title: t.String({ minLength: 4, maxLength: 100 }),
              content: t.Optional(t.String({ minLength: 1, maxLength: 500 })),
            }),
          }
        )
        .patch(
          "/update-post/:postId",
          async ({
            db,
            jwt,
            cookie: { TOKEN },
            body: { title, content },
            params: { postId },
          }) => {
            if (TOKEN.get() === undefined) {
              return { msg: "You are not logged in" };
            }

            const token = await jwt.verify(TOKEN.get());

            const p = await db.select().from(posts).where(eq(posts.id, postId));

            if (p[0] === undefined) {
              return { msg: "Post not found" };
            }

            if (!token || token.loggedInUserId !== p[0].authorId) {
              return { msg: "Unauthorized to update" };
            }

            const up = await db
              .update(posts)
              .set({
                title,
                content,
                edited: true,
              })
              .where(eq(posts.id, postId))
              .returning();

            const { authorId, ...out } = up[0];

            return { msg: "Post updated", post: out };
          },

          {
            body: t.Object({
              title: t.String({ minLength: 4, maxLength: 100 }),
              content: t.String({ minLength: 1, maxLength: 500 }),
            }),
            params: t.Object({
              postId: t.String(),
            }),
          }
        )
        .delete(
          "/delete-post/:postId",
          async ({ db, jwt, cookie: { TOKEN }, params: { postId } }) => {
            if (TOKEN.get() === undefined) {
              return { msg: "You are not logged in" };
            }

            const token = await jwt.verify(TOKEN.get());

            const p = await db.select().from(posts).where(eq(posts.id, postId));

            if (p[0] === undefined) {
              return { msg: "Post not found" };
            }

            if (!token || token.loggedInUserId !== p[0].authorId) {
              return { msg: "Unauthorized to delete" };
            }

            const d = await db
              .delete(posts)
              .where(eq(posts.id, postId))
              .returning();

            const { authorId, ...out } = d[0];

            return { msg: "Post deleted", post: out };
          },

          {
            params: t.Object({
              postId: t.String(),
            }),
          }
        )
  );

app.listen(3000, () => {
  console.log(
    `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
  );
});
