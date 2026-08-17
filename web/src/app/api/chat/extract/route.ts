import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { callGeminiJson, EXTRACT_SYSTEM_PROMPT } from "@/lib/gemini";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Gemini を同期で待つため関数上限を延ばす

const ExtractSchema = z.object({
  history: z
    .array(z.object({ role: z.enum(["user", "model"]), text: z.string() }))
    .min(1),
});

/** Gemini 出力の検証スキーマ（EXTRACT_SYSTEM_PROMPT の出力形と一致）。 */
const ResultSchema = z.object({
  card: z.object({
    product: z.string(),
    benefit: z.string(),
    segment: z.string(),
    reach: z.string(),
    dept: z.string(),
    signal: z.string(),
  }),
  brief: z.string().min(1),
  title: z.string().min(1),
  useCase: z.string().min(1),
  target: z.coerce.number().int().min(0),
  columns: z.array(z.string()),
  planSummary: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = ExtractSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const raw = await callGeminiJson(
      EXTRACT_SYSTEM_PROMPT,
      parsed.data.history,
      "ここまでの会話から、指定スキーマの JSON だけで要件と作成プランを返してください。"
    );
    const result = ResultSchema.safeParse(raw);
    if (!result.success) {
      return NextResponse.json(
        { error: "抽出結果の形式が不正でした。もう少し会話を進めてから試してください。" },
        { status: 502 }
      );
    }
    return NextResponse.json(result.data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "要件抽出に失敗しました" },
      { status: 502 }
    );
  }
}
