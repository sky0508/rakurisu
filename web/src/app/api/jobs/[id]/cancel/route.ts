import { NextResponse, type NextRequest } from "next/server";
import { cancelJob } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await cancelJob(id);
  return NextResponse.json({ ok: true }, { status: 200 });
}
