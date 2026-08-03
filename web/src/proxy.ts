import { unsealData } from "iron-session";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, type RakurisuSession } from "./lib/session";

/**
 * 認証ガード。middleware.ts ではなく proxy.ts に集約（Next16）。
 * layout でのガードは redirect loop を招くのでここと各 requireAuth に置く。
 */
export async function proxy(request: NextRequest) {
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
