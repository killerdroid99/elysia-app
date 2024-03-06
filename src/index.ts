import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";

const app = new Elysia().use(
  cors({
    allowedHeaders: ["Content-Type", "Authorization"],
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);

app.get("/", (ctx) => {
  return { msg: "hello world" };
});

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
