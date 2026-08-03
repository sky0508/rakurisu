import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { listQueue, createJob } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await listQueue();
  return NextResponse.json(data);
}

const CreateSchema = z.object({
  title: z.string().min(1),
  useCase: z.string().min(1),
  target: z.coerce.number().int().min(0),
  compliance: z.string().optional(),
  brief: z.string().optional(),
  recipeId: z.string().uuid().nullish(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const job = await createJob({
    title: parsed.data.title,
    useCase: parsed.data.useCase,
    target: parsed.data.target,
    compliance: parsed.data.compliance,
    brief: parsed.data.brief,
    recipeId: parsed.data.recipeId ?? null,
  });
  return NextResponse.json({ job }, { status: 201 });
}
