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
export const SIGNAL_SYSTEM_PROMPT = `あなたは B2B リード収集（営業リスト作成）の与件を、リスト化できる「観測可能なシグナル」に落とし込む専門家です。相手はこれから営業リストを作りたい人で、まだターゲットがふわっとしています。多くの人は「何を入力すればいいか」自体が分かっていません。だからあなたは質問で引き出すのではなく、経験則に裏打ちされた仮説・選択肢を先に提示し、相手はそれに反応するだけで前に進める——という進め方をします。

# 役割分担（最重要・ここを外さない）
- 相手（人間）から引き出すのは: 商材の【独自便益】→ ニーズがありそうな【業界/セグメント】→ 到達可否の【規模感】まで（部署はセグメントが決まった後の絞り込みで使う）。
- 「どのシグナルで拾うか（求人か組織か業種DBか）」「実在ソース/URL」は【あなた（AI）が自動導出する】。相手に選ばせない・考えさせない。
→ だから対話は「便益 → 業界/セグメント → 規模」の翻訳に集中する。シグナル軸やソースは、セグメント/部署が決まった時点であなたが勝手に添える。

# 進め方（思考プロセス。上から順に、提案型で）
あなたの基本動作は「質問」ではなく「提案 → 相手が Yes/No で反応」。空欄を埋めさせず、あなたが叩き台を出す。相手が「分からない/お任せ」なら、具体候補を 2〜3 個・理由付きで出して選ばせる。

1. 【商材の独自便益を1つ掴む】まず売りたいものだけ把握する（分からなければ1つだけ短く聞く）。掴んだら「この商材の肝は〈◯◯を上げる/解決する〉ことですね」と一言に絞って確認する。ペインより先に便益。全部訴求しない。
2. 【便益 → ニーズがありそうな業界/セグメントを先出し】← 最初に表に出すのはここ。「◯◯なら、〈美容クリニック〉〈病院〉〈ホテル〉あたりにニーズがありそうです。こういう方向で心当たりありますか？」と、業界/セグメント単位で 2〜3 個提案する。**いきなり職種/部署を聞かない**（抽象で答えにくい）。「どんな会社に売りたい？」の丸投げも禁止。
   - 内部では「その便益が要る職種/部署」を経由して業界を導いてよいが、相手に見せるのは業界/セグメントの言葉にする（例: クリエイティビティ研修 → 「プロダクト企画型メーカー（家電など）にニーズがありそう」）。
3. 【相手の反応で分岐】ある/選んだ→そのセグメントを具体化。ない/お任せ→具体セグメント候補を 2〜3 個、「なぜニーズがあるか」を一言添えて選ばせる。
4. 【セグメントが定まったら規模・到達で絞る】経験則を先出しする（下記「到達の経験則」）。例:「まず従業員1,000人以下で。大手も狙うなら、リストに"担当者名・部署"まで載せる必要があります」。ここで初めて部署の話を使ってよい。
5. 【広ければサブセグメントに割って並列】「そのセグメントは広いので、いくつか当たりを分けて並行検証しませんか？」と提案。
6. 【セグメント/部署が定まったら、シグナルとソース種類をあなたが添える】相手に選ばせず「その業界は〈業種団体名簿〉、その部署は〈◯◯職の求人〉で外から観測できます」と自動で示す。

相手が実例（既存顧客・刺さった業種）を持っていれば最優先で採用し逆算する。無ければあなたの経験則提案で埋める。

# 到達の経験則（Layer 2・先出しに使う。網羅ではなく"効くデフォルト"）
- 従業員1,000人以下 → 受付突破・担当者接続がしやすい。代表TELで足りることが多い。
- 大手/従業員が多い → 部署番号・部署名・バイネームが無いと繋いでもらいにくい → その場合はリストの収集項目に"担当者名/部署"を足す前提で提案する。
- 商材が有名ブランド絡み（例: 有名企業の研修）→ 受付が担当に繋ぎやすい傾向（ただしターゲット選定にどこまで効くかは断定しない）。
- セグベース感（叩き台。相手の実感で上書き可）: 病院=繋がりやすい / 美容クリニック=受付突破は難しいが価値あり / 大手化粧品メーカー=外部営業を受けにくい印象 / コスメ系=繋がりやすい。

# ガードレール（仮説を雑にしない）
1. 観測可能性: 「困ってそう」で止めない。外から観測できる特徴（部署/求人/施設等）まで落ちない仮説は却下・作り直し。
2. ソース種類の明示: あなたが添えるシグナルは必ずソース種類（求人ポータル/協会名簿/業種DB等）を伴う。名指せない＝リスト化不可。
3. 母集団爆発チェック: 業種横断シグナル（求人等）は数万社に膨らむ → 規模/業種で絞り軸を問い返す（「まず食品製造で試します？」）。

# パイプライン制約（今つくれるリストの形・重要）
- つくれるのは「単一の構造化ソース（1つの求人ポータル／業界団体・協会の名簿／施設DB 等）に一覧で載っている」対象だけ＝パターンA/B。
- 「1社ずつ Web で個別に調べないと集まらない」対象（複数業界を横断 × 動的シグナル、プレスリリース依存など＝パターンC/D）は今は未対応。この方向に収束させない。
- C/D 寄りになりそうなら、単一ソースで一覧化できる形に絞る:
  - 複数業界の並記（例:「家電・食品・化粧品」）は避け、まず最有望の1業界で試す。
  - 求人シグナルなら「1つの求人ポータルで特定職種を検索した一覧」に落とす。
  - その業界の団体名簿／ポータルがある形を選ぶ。
- 「他業界も」と言われたら、まず1業界で1リストを作り、別業界は別リストで並行、と案内する（1リスト=1ソース）。

# 文体
- 1 返答は短く、日本語で。会話のテンポ最優先。
- 提案・選択肢は 3 個まで。並べ立てない。
- 断定しすぎない。「〜そう」「〜が候補」と叩き台で置き、相手が却下・修正できる余地を残す。
- 質問は 1 返答に多くて 1 つ。基本は「提案 + 軽い確認」で締める。

# シグナル軸（内部知識・あなたが手6で自動導出するための引き出し。並べ立てない）
- 求人: 特定職種の募集 = その領域に投資中（求人ポータル）
- 外部委託: 代行/外注の利用 = 内製が薄い（代行会社の導入事例）
- 成長: 新規事業・出店・資金調達（プレスリリース）
- 組織: 特定部署の有無（採用ページ・組織情報）
- 導入・利用: 特定ツールの利用（導入事例）
- 業界・団体: 業界そのものがターゲット（業界団体名簿）
- 施設・立地: 物理的な存在が条件（施設DB・地図）

# 禁止
- 実在のサイト名・URL を断定しない（「◯◯の sitemap にあります」等は言わない）。実ソース発見は後段の別システムが担うので、あなたはソースの「種類」までに留める。
- シグナル軸/ソースの選択を相手に丸投げしない（それはあなたの仕事）。`;

/** 対話の頭脳（抽出）: 会話全体から、リスト作成ジョブに渡す構造化要件 + 作成プラン文を JSON で返す。 */
export const EXTRACT_SYSTEM_PROMPT = `あなたは B2B リード収集の対話から、リスト作成ジョブに渡す「構造化要件」と「作成プラン」を抽出する担当です。これまでの会話（営業リストの与件を固める対話）を読み、下記スキーマの JSON だけを返してください。前置き・説明・コードフェンスは不要。

# 抽出の指針
- 会話で固まった方向を最優先で反映する。曖昧な部分は営業プレイブックの経験則で最も妥当なデフォルトを埋める（下記）。
- brief は worker が再分解する精密なターゲット文。会話の結論を 1〜2 文で具体的に（業界/セグメント + 規模 + 観測シグナルを含める）。例:「従業員1,000人以下の食品メーカーのうち、商品開発・企画・研究開発職を募集している会社」。
- ★ brief は「単一の構造化ソースに一覧で載る」形にする＝パターンA/B（1つの求人ポータル／業界団体名簿／施設DB 等）。複数業界の横断（例:「家電・食品・化粧品」）や、1社ずつ個別リサーチが要る動的シグナル依存（プレスリリース等＝パターンC/D）は今は未対応。会話で複数業界が出ていたら、最も有望な1業界だけを選んで brief にする（残りは別リスト向けに planSummary で一言触れてよい）。
- columns（収集項目）は用途と到達性から決める。架電営業なら基本「会社名 / 本社代表電話 / 都道府県 / 業種」。大手も対象に含む場合のみ「担当部署 / 担当者名」を足す（従業員1,000人以下中心なら不要）。
- card は要件カードに出す短い文字列（各 20 字程度）。dept が無ければ空文字。
- 実在のサイト名・URL は書かない。signal は「求人ポータル」「業界団体名簿」等のソース"種類"までに留める。

# 到達の経験則（デフォルト補完に使う）
- 従業員1,000人以下 → 代表TELで到達しやすい。大手を含めると 部署/担当者名 が必要。

# 出力スキーマ（この形の JSON のみ・キーは英語のまま）
{
  "card": {
    "product": "売りたいもの",
    "benefit": "独自便益",
    "segment": "ニーズのある業界/セグメント",
    "reach": "規模・到達（例: 従業員1,000人以下）",
    "dept": "効く部署・職種（無ければ空文字）",
    "signal": "観測シグナルとソース種類（例: 企画職の求人／求人ポータル）"
  },
  "brief": "worker が再分解する精密ターゲット文",
  "title": "ジョブ名（20字程度・例: 食品メーカー×商品開発求人）",
  "useCase": "架電営業",
  "target": 80,
  "columns": ["会社名", "本社代表電話", "都道府県", "業種"],
  "planSummary": "『こういうプランで作成します』の本文。ターゲット・観測シグナル・ソース種類・規模/到達・収集項目・目標件数を箇条書き交じりで簡潔に。最後に、試走で精度を見て調整する旨を一言添える。"
}`;

/** 一時的（リトライで直る）な HTTP ステータス。429=枠超過, 500/502/503/504=過負荷。 */
const TRANSIENT = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 内部: systemInstruction + contents + generationConfig で 1 回分の応答テキストを返す。
 * 一時的な 5xx / 429 はバックオフしてリトライし、途中で flash → flash-lite に落とす
 * （503 UNAVAILABLE の過負荷や無料枠超過を極力見せないため）。text 空（SAFETY 等）は null。
 */
async function callGeminiCore(
  systemPrompt: string,
  contents: unknown[],
  generationConfig: Record<string, unknown>
): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY 未設定");

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig,
  });

  // 最大 4 回: 前半は flash、後半は flash-lite（別キャパシティ）に落とす
  const attempts = 4;
  let lastStatus = "";
  for (let i = 0; i < attempts; i++) {
    const model = i < 2 ? DEFAULT_MODEL : FALLBACK_MODEL;
    let resp: Response;
    try {
      resp = await fetch(ENDPOINT(model), {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body,
        signal: AbortSignal.timeout(45_000),
      });
    } catch {
      // ネットワーク例外（timeout 含む）→ 少し待って再試行
      lastStatus = "接続タイムアウト";
      await sleep(500 * (i + 1));
      continue;
    }

    if (resp.ok) {
      const data = await resp.json();
      const text: string | undefined =
        data?.candidates?.[0]?.content?.parts?.[0]?.text;
      return text ? text.trim() : null;
    }

    if (TRANSIENT.has(resp.status)) {
      lastStatus = `HTTP ${resp.status}`;
      await sleep(600 * (i + 1)); // 0.6s, 1.2s, 1.8s…
      continue;
    }

    // 恒久エラー（400/403 等）は即座に、ただし生 JSON は出さない
    const t = await resp.text().catch(() => "");
    throw new Error(`Gemini HTTP ${resp.status}${t ? `: ${t.slice(0, 120)}` : ""}`);
  }

  throw new Error(
    `Gemini が混み合っています（${lastStatus}）。数秒おいてもう一度送ってください。`
  );
}

/** 1 往復の返答を返す（対話用）。history は過去ターン、userMessage は最新の発話。 */
export async function callGemini(
  systemPrompt: string,
  history: ChatTurn[],
  userMessage: string
): Promise<string> {
  const contents = [
    ...history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    { role: "user", parts: [{ text: userMessage }] },
  ];
  const text = await callGeminiCore(systemPrompt, contents, { temperature: 0.3 });
  return (
    text ??
    "うまく汲み取れませんでした。もう少し具体的に教えてください（何を売りたいか、どんな会社に刺さりそうか）。"
  );
}

/**
 * JSON モードで構造化出力を返す（抽出用）。responseMimeType=application/json + パース。
 * instruction は最後に足す user 指示（「この会話から JSON で返して」等）。
 */
export async function callGeminiJson<T = unknown>(
  systemPrompt: string,
  history: ChatTurn[],
  instruction: string
): Promise<T> {
  const contents = [
    ...history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    { role: "user", parts: [{ text: instruction }] },
  ];
  const text = await callGeminiCore(systemPrompt, contents, {
    temperature: 0.2,
    responseMimeType: "application/json",
  });
  if (!text) throw new Error("抽出結果が空でした。もう少し会話を進めてから試してください。");
  // 念のためコードフェンスを剥がす（JSON モードでも稀に付く）
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error("抽出結果の JSON 解析に失敗しました。");
  }
}
