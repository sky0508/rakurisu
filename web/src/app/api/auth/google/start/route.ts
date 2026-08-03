import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = randomBytes(16).toString("hex");
  const session = await getSession();
  session.oauthState = state;
  await session.save();

  return NextResponse.redirect(getAuthUrl(state));
}
