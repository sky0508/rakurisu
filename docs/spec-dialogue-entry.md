# spec — 対話型・与件分解「入口スライス」（対話のガワ）

作成: 2026-08-08 / status: 実装中
親仕様: `docs/spec-dialogue-decompose.md`（対話型・与件分解 全体像）

親仕様のうち「対話設計の入り口」だけを切り出した最初の実装スライス。目的は「すぐ動いているものが見える」を最短で満たすこと ＝ 入口で分岐し、対話画面が立ち上がり、AI と 1 往復以上会話できる"ガワ"を通す。シグナル発見の頭脳（構造化抽出・N 仮説・ジョブ生成）は次スライス。

## スコープ

### In
- 「新規ジョブ」の入口二択（ターゲット決まってる→従来フォーム / ふわっとしてる→対話）
- 対話画面の器（左: メッセージリスト＋入力欄 / 右: 要件カードの枠）
- `/api/chat` 同期エンドポイント（Gemini fetch 直叩き・自由文 1 往復）
- 対話が"賢い最初の質問"を返せる system prompt（現在地特定＝既存顧客>ペイン>商材。7 軸カタログ同梱）

### Out（次スライス）
- 要件カードへの構造化抽出・ライブ更新（本スライスは枠のみ）
- N 仮説カード / 走らせ方選択 / 共通フォーム / ジョブ生成
- `hypothesis_set_id` / `decomp` の DB 列追加 / 比較ビュー
- worker の変更（decompose_brief スキップ分岐）
- 会話履歴の永続化（ローカル state のみ）

## 設計

### 入口二択（`EntryPicker.tsx`）
- 起点: `Console.tsx` の「＋新規ジョブ」。state を `modalOpen: boolean` → `mode: "pick"|"form"|"chat"|null` に置換
- 「決まってる」→ 既存 `NewJobModal`（無改修）／「ふわっと」→ `ChatCompose`

### 対話画面（`ChatCompose.tsx`）
- 幅広テイクオーバー（`.overlay` + `.chatwrap`）。左 1fr メッセージ / 右 280px 要件カード枠。960px で縦積み
- 左: メッセージバブル（話者で左右振り分け）＋ `.field textarea` 相当の入力＋送信 `.btn-primary`（送信中 disabled）。⌘/Ctrl+Enter 送信
- 右: 分解チェーン 6 行（売りたいもの/ペイン/シグナル軸/ソース種類/パターン/絞り込み軸）をプレースホルダ表示
- state はローカル（`messages`/`input`/`sending`/`err`）。Console の SWR とは別系統
- 送信: `postJson<ChatReply>("/api/chat", { message, history })`
- フッタ: 「閉じる」＋ disabled「この要件で仮説を出す →」（次スライスの接続口）

### API（`app/api/chat/route.ts`）
- `export const dynamic = "force-dynamic"` / `export const maxDuration = 60`
- zod: `{ message: string.min(1), history?: {role:"user"|"model", text}[] }`
- proxy.ts の matcher が自動ガード（`PUBLIC_DEMO=1` で全通過）

### Gemini ヘルパ（`lib/gemini.ts`・`server-only`）
- worker `decompose.py` の `_gemini_json` を TS 化。SDK 不使用（fetch 直叩き）
- `DEFAULT_MODEL=gemini-2.5-flash` / `FALLBACK_MODEL=gemini-2.5-flash-lite`。キーは `x-goog-api-key` ヘッダ
- 自由文会話なので `responseMimeType` は付けない。`AbortSignal.timeout(45000)`／429 で flash→flash-lite フォールバック
- `systemInstruction` にシグナル発見の枠組み（現在地特定・7 軸カタログ・実 URL 断定禁止）

### env
- `GEMINI_API_KEY` は `web/.env.local` に既存 → ローカル即動く
- `.env.local.example` に GEMINI_API_KEY プレースホルダ追記
- 本番は Vercel env に GEMINI_API_KEY 追加が必要（Sora 手作業）

## 検証
- `cd web && pnpm dev`（:3060・`PUBLIC_DEMO=1` でログイン不要）
- 「＋新規ジョブ」→ 二択 → 「決まってる」で従来フォーム（回帰なし）／「ふわっと」で対話画面
- 「リフォーム会社に何か売りたい」→ AI が現在地特定の質問を返す → もう 1 往復
- `npx tsc --noEmit` 0 / `pnpm build` 緑

## 次スライスへの引き継ぎ
- `ChatCompose` の disabled「仮説を出す」ボタン ＝ N 仮説→選択→ジョブ生成の接続口
- 要件カード枠 6 行 ＝ 構造化抽出のライブ更新の描画先
- `gemini.ts` system prompt ＝ 構造化出力（JSON モード・N 仮説）への発展口
