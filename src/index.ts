import { Cookie, Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { db } from "./db";
import { users } from "./schema/user";
import { v4 } from "uuid";
import { jwt } from "@elysiajs/jwt";
import { eq } from "drizzle-orm";

const app = new Elysia()
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

app.group(
  "/auth",
  {
    cookie: t.Cookie(
      {
        TOKEN: t.Optional(t.String()),
      },
      {
        path: "/",
        priority: "high",
        maxAge: 1000 * 60 * 60 * 2, // 2 hours
        httpOnly: false,
        secure: true,
        sameSite: "lax",
      }
    ),
  },
  (app) =>
    app
      .post(
        "/login",
        async ({ db, body: { email, password }, jwt, cookie: { TOKEN } }) => {
          if (TOKEN.get() !== undefined) {
            return { msg: "Session already exists" };
          }

          const u = await db.select().from(users).where(eq(users.email, email));

          const { password: pwd, ...out } = u[0];

          if (out.id === undefined) {
            return { msg: `No user with email ${email} exists` };
          }

          if (!(await Bun.password.verify(password, u[0].password as string))) {
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
            email: t.String({ format: "email", error: "Invalid email" }),
            password: t.String({ minLength: 8 }),
            loginDirectly: t.Boolean(),
          }),
        }
      )
      .post("/logout", async ({ cookie: { TOKEN } }) => {
        if (TOKEN.get() === undefined) {
          return { msg: "No session exists" };
        }

        TOKEN.remove();

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

        return { msg: "Current user exists", user: out };
      })
);

app.listen(3000, () => {
  console.log(
    `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
  );
});
