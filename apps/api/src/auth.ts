import { createHash, randomBytes } from "crypto";
import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { db, type AgencyUser } from "@seo/db";

export const SESSION_COOKIE = "reachline_session";
const SESSION_DAYS = 14;

export type AuthedRequest = Request & { user?: AgencyUser };

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
    },
  });
  return token;
}

export async function destroySession(token: string | undefined) {
  if (!token) return;
  await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function resolveSession(
  token: string | undefined
): Promise<AgencyUser | null> {
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    }
    return null;
  }
  return session.user;
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

const PUBLIC_PREFIXES = [
  "/health",
  "/auth/login",
  "/auth/logout",
  "/public",
  "/uploads",
];

function isPublicPath(path: string, method: string) {
  if (PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return true;
  }
  // OAuth provider callbacks must stay public; starts require auth
  if (
    method === "GET" &&
    /^\/oauth\/(meta|tiktok|youtube)\/callback$/.test(path)
  ) {
    return true;
  }
  return false;
}

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  if (isPublicPath(req.path, req.method)) {
    return next();
  }

  const token =
    (req.cookies?.[SESSION_COOKIE] as string | undefined) ??
    (typeof req.headers.authorization === "string" &&
    req.headers.authorization.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined);

  const user = await resolveSession(token);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.user = user;
  return next();
}
