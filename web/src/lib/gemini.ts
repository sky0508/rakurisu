import "server-only";

/**
 * Gemini 呼び出し（web 同期・対話用）。
 * worker/decompose.py の _gemini_json を TypeScript に写経したもの。
 * SDK は使わず REST を fetch 直叩き（依存追加ゼロ・worker と同じ挙動）。
 *
 * 用途は「対話で与件をシグナルに分解する」自由文チャット。
 * JSON モード（responseMimeType）は付けない。構造化出力は次スライスで別途。
 */

const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-2.5-flash-lite"; // 無料枠 RPD 429 時のフォールバック
const ENDPOINT = (m: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;

export type ChatTurn = { role: "user" | "model"; text: string };

/** 対話の頭脳: ふわっとした与件を「観測可能なシグナル」に落とし込む。 */
export const SIGNAL_SYSTEM_PROMPT = `あなたは B2B リード収集（営業リスト作成）の与件を、リスト化できる「観測可能なシグナル」に落とし込む専門家です。相手はこれから営業リストを作りたい人で、まだターゲットがふわっとしています。

# ゴール
ふわっとした与件を、次の連鎖で「外から観測できる会社の特徴（＝シグナル）」まで一緒に落とす:
売りたいもの → ペイン（何に困る人に刺さるか）→ シグナル（そのペインが外から見える会社の特徴）→ ソースの種類（そのシグナルが載っている公開データの種類）

# 進め方（重要）
- 質問攻めにしない。まず現在地を特定し、足りない情報を「1 つだけ」優先度順に聞く:
  1. 既存顧客がいるなら「これまで刺さった 2〜3 社の共通点は？」（最優先。実例からシグナルを逆算できる）
  2. いなければ「どんな困りごとに一番刺さりますか？」（ペイン）
  3. 商材が曖昧なら「何を売りたいですか？」
- 情報が集まってきたら、断定せず「こういうシグナルで観測できそう」と仮説を言葉で返す。
- 1 返答は短く、日本語で。会話のテンポを大事にする。箇条書きは 3 点まで。

# シグナル軸（内部知識・全部を並べ立てない）
- 求人: 特定職種の募集 = その領域に投資中（求人ポータル）
- 外部委託: 代行/外注の利用 = 内製が薄い（代行会社の導入事例）
- 成長: 新規事業・出店・資金調達（プレスリリース）
- 組織: 特定部署の有無（採用ページ・組織情報）
- 導入・利用: 特定ツールの利用（導入事例）
- 業界・団体: 業界そのものがターゲット（業界団体名簿）
- 施設・立地: 物理的な存在が条件（施設DB・地図）

# 禁止
- 実在のサイト名・URL を断定しない（例:「SUUMO の sitemap にあります」等は言わない）。実際のソース発見は後段の別システムが担うので、あなたはソースの「種類」までに留める。
- 結論を急がない。まずシグナルを一緒に見つけることに集中する。`;

/**
 * 1 往復の返答を返す。history は過去ターン（user/model 交互）、userMessage は最新の発話。
 */
export async function callGemini(
  systemPrompt: string,
  history: ChatTurn[],
  userMessage: string,
  model: string = DEFAULT_MODEL
): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY 未設定");

  const contents = [
    ...history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    { role: "user", parts: [{ text: userMessage }] },
  ];
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { temperature: 0.3 },
  };

  let resp: Response;
  try {
    resp = await fetch(ENDPOINT(model), {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (e) {
    throw new Error(
      `Gemini 接続失敗: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  // 429（無料枠 RPD 超過）は flash → flash-lite に 1 回だけ落として再試行
  if (resp.status === 429 && model !== FALLBACK_MODEL) {
    await new Promise((r) => setTimeout(r, 2000));
    return callGemini(systemPrompt, history, userMessage, FALLBACK_MODEL);
  }
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Gemini HTTP ${resp.status}: ${t.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text: string | undefined =
    data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    // SAFETY ブロック等で parts が空のときの丁寧なフォールバック
    return "うまく汲み取れませんでした。もう少し具体的に教えてください（何を売りたいか、どんな会社に刺さりそうか）。";
  }
  return text.trim();
}
