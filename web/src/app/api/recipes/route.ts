import { NextResponse } from "next/server";
import { listRecipes } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const recipes = await listRecipes();
  return NextResponse.json({ recipes });
}
