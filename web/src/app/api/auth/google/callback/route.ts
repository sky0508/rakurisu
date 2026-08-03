import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { exchangeCode } from "@/lib/google";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { users } from "../../../../../../drizzle/schema";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errParam = searchParams.get("error");

  if (errParam) return errorResponse(`Google OAuth declined: ${errParam}`, 400);
  if (!code || !state) return errorResponse("Missing code or state", 400);

  const session = await getSession();
  const expectedState = session.oauthState;
  session.oauthState = undefined;
  await session.save();

  if (!expectedState || expectedState !== state) {
    return errorResponse("Invalid OAuth state", 400);
  }

  let token: Awaited<ReturnType<typeof exchangeCode>>;
  try {
    token = await exchangeCode(code);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return errorResponse(`Token exchange failed: ${msg}`, 400);
  }

  // ALLOW_DOMAIN が未設定なら「どの Google アカウントでもログイン可」。
  // 後で絞りたくなったら env に marchon.co.jp 等を入れるだけでドメイン制限が復活する。
  const allow = process.env.ALLOW_DOMAIN?.trim();
  if (allow) {
    const domain = token.email.split("@")[1]?.toLowerCase();
    if (domain !== allow.toLowerCase()) {
      return errorResponse(
        `このメールアドレス (${token.email}) はログインを許可されていません。`,
        403
      );
    }
  }

  // user upsert: 新規の最初の登録者 = admin、以降 member。既存は role 維持 + 復活。
  const existing = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.email, token.email))
    .limit(1);

  let userId: string;
  let role: "admin" | "member";

  if (existing[0]) {
    userId = existing[0].id;
    role = existing[0].role as "admin" | "member";
    await db
      .update(users)
      .set({ name: token.name, deletedAt: null })
      .where(eq(users.id, userId));
  } else {
    const count = await db.select({ n: sql<number>`count(*)::int` }).from(users);
    const firstUser = (count[0]?.n ?? 0) === 0;
    role = firstUser ? "admin" : "member";
    const inserted = await db
      .insert(users)
      .values({ email: token.email, name: token.name, role })
      .returning({ id: users.id });
    userId = inserted[0].id;
  }

  session.userId = userId;
  session.email = token.email;
  session.role = role;
  session.signedInAt = Date.now();
  await session.save();

  return NextResponse.redirect(new URL("/", request.url));
}

function errorResponse(message: string, status: number) {
  return new NextResponse(
    `<!doctype html><html lang="ja"><body style="font-family:system-ui;padding:24px;color:#1F1E1B">
      <h1 style="font-size:18px;margin:0 0 8px">ログインに失敗しました</h1>
      <p style="margin:0 0 16px">${escapeHtml(message)}</p>
      <a href="/login" style="color:#C4532F">← ログインに戻る</a>
    </body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
