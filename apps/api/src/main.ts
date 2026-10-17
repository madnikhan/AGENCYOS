import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config";
import { requireAuth } from "./auth";
import { authRouter } from "./routes/auth";
import { clientsRouter } from "./routes/clients";
import { briefsRouter, postsRouter } from "./routes/posts";
import { channelsRouter, oauthRouter } from "./routes/oauth";
import { dashboardRouter } from "./routes/dashboard";
import { publicRouter } from "./routes/public";
import { settingsRouter } from "./routes/settings";
import { analyticsRouter } from "./routes/analytics";

const app = express();
app.use(
  cors({
    origin: env.webUrl,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(env.uploadsDir));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "seo-api" });
});

app.use(requireAuth);

app.use("/auth", authRouter);
app.use("/dashboard", dashboardRouter);
app.use("/clients", clientsRouter);
app.use("/briefs", briefsRouter);
app.use("/posts", postsRouter);
app.use("/channels", channelsRouter);
app.use("/oauth", oauthRouter);
app.use("/settings", settingsRouter);
app.use("/analytics", analyticsRouter);
app.use("/public", publicRouter);

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(err);
    res.status(500).json({ error: err.message || "Internal error" });
  }
);

app.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}`);
});
