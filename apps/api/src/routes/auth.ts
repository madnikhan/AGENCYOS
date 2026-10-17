import { Router } from "express";
import { db } from "@seo/db";
import {
  clearSessionCookie,
  createSession,
  destroySession,
  SESSION_COOKIE,
  setSessionCookie,
  verifyPassword,
  type AuthedRequest,
} from "../auth";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const email = String(req.body?.email ?? "")
    .trim()
    .toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  const user = await db.agencyUser.findUnique({ where: { email } });
  if (!user?.passwordHash) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = await createSession(user.id);
  setSessionCookie(res, token);
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
});

authRouter.post("/logout", async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  await destroySession(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get("/me", async (req: AuthedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  res.json({
    id: req.user.id,
    email: req.user.email,
    name: req.user.name,
    role: req.user.role,
  });
});
