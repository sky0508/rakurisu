import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { callGemini, SIGNAL_SYSTEM_PROMPT } from "@/lib/gemini";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Gemini を同期で待つため関数上限を延ばす

const ChatSchema = z.object({
  message: z.string().min(1),
  history: z
    .array(z.object({ role: z.enum(["user", "model"]), text: z.string() }))
    .optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = ChatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const reply = await callGemini(
      SIGNAL_SYSTEM_PROMPT,
      parsed.data.history ?? [],
      parsed.data.message
    );
    return NextResponse.json({ reply });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gemini 呼び出しに失敗しました" },
      { status: 502 }
    );
  }
}
