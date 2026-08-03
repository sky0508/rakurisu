import "server-only";
import { google } from "googleapis";

/** googleapis 内部の OAuth2 client 型 */
type OAuth2 = InstanceType<typeof google.auth.OAuth2>;

/**
 * Google OAuth（ログインのみ）。ラクリスは Gmail/Drive を使わないので scope は最小。
 * Sheets 納品はワーカー側の gsheets トークンが担う（web の user OAuth ではない）。
 */
export const GOOGLE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

export function createOAuthClient(): OAuth2 {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  const redirect = process.env.GOOGLE_REDIRECT_URI;
  if (!id || !secret || !redirect) {
    throw new Error(
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI must be set"
    );
  }
  return new google.auth.OAuth2(id, secret, redirect);
}

export function getAuthUrl(state: string): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "online",
    prompt: "select_account",
    scope: GOOGLE_SCOPES,
    state,
    include_granted_scopes: true,
  });
}

export type ExchangedToken = { email: string; name: string };

export async function exchangeCode(code: string): Promise<ExchangedToken> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) {
    throw new Error("id_token missing in Google response");
  }
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.email) {
    throw new Error("email missing in id_token payload");
  }
  return { email: payload.email, name: payload.name ?? payload.email };
}
