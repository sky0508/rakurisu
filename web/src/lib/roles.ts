import "server-only";
import { redirect } from "next/navigation";
import { getSession } from "./session";

export type Role = "admin" | "member";
export type AuthedUser = { userId: string; email: string; role: Role };

/** Server Component / Route Handler で「ログイン user」を取得。未ログインは /login へ。 */
export async function requireAuth(): Promise<AuthedUser> {
  const session = await getSession();
  if (!session.userId || !session.email || !session.role) {
    redirect("/login");
  }
  return {
    userId: session.userId,
    email: session.email,
    role: session.role,
  };
}

export function isAdmin(role: Role | undefined): role is "admin" {
  return role === "admin";
}
