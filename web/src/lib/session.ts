import "server-only";
import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";

export type RakurisuSession = {
  userId?: string;
  email?: string;
  role?: "admin" | "member";
  signedInAt?: number;
  /** OAuth state (CSRF) — start で書き、callback で消費 */
  oauthState?: string;
};

const SESSION_COOKIE = "rakurisu_session";

function sessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET must be a string of at least 32 characters.");
  }
  return {
    cookieName: SESSION_COOKIE,
    password,
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      httpOnly: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 日
    },
  };
}

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<RakurisuSession>(cookieStore, sessionOptions());
}

export { SESSION_COOKIE };
