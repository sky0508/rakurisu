import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { enqueueRun } from "@/lib/queries";

export const dynamic = "force-dynamic";

const RunSchema = z.object({
  kind: z.enum(["dryrun", "production"]),
  limitN: z.coerce.number().int().positive().nullish(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = RunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  // 試走は既定 --limit 40。本番は無制限（null）。
  const limitN =
    parsed.data.limitN ?? (parsed.data.kind === "dryrun" ? 40 : null);
  const run = await enqueueRun(id, parsed.data.kind, limitN);
  return NextResponse.json({ run }, { status: 201 });
}
