import { unsealData } from "iron-session";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, type RakurisuSession } from "./lib/session";

/**
 * 認証ガード。middleware.ts ではなく proxy.ts に集約（Next16）。
 * layout でのガードは redirect loop を招くのでここと各 requireAuth に置く。
 */
export async function proxy(request: NextRequest) {
  // デモ公開モード（C: URL=鍵・ログイン無し）。PUBLIC_DEMO=1 でゲートを無効化。
  // ⚠ leads=実在企業の電話リスト。共有は noindex + URL 秘匿が前提（本番で常時 ON にしない）。
  if (process.env.PUBLIC_DEMO === "1") {
    return NextResponse.next({ request });
  }

  const sealed = request.cookies.get(SESSION_COOKIE)?.value;
  const password = process.env.SESSION_SECRET;

  let signedIn = false;
  if (sealed && password) {
    try {
      const data = await unsealData<RakurisuSession>(sealed, { password });
      signedIn = Boolean(data?.userId);
    } catch {
      // 改竄 / 期限切れ / SESSION_SECRET 変更時は未ログイン扱い
    }
  }

  if (!signedIn) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next({ request });
}

export const config = {
  // 認証必須ルートだけマッチ。除外: /login, /api/auth/*, /_next/*, /favicon.ico
  matcher: ["/((?!login|api/auth|_next|favicon\\.ico).*)"],
};
