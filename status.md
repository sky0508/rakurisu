---
name: rakurisu
status: active
next_action: 対話の頭脳リデザイン＋対話→リスト作成の一気通貫を実装・push 済み（2026-08-17・web のみ）。次 = Phase 2（構造化 decomp を worker に渡す精度厳密化＝`jobs.decomp` 列＋worker の decompose_brief スキップ分岐＋再デプロイ。これでパターンC完全排除も同時）／N 仮説→並列＋`hypothesis_set_id` 比較ビュー／専用作成プラン確認モーダル。旧・残タスク（worker Mac 常駐での従来フル E2E / 認証恒久方針 §11-2）は継続。計画=`~/.claude/plans/users-sorasasaki-desktop-inbox-cleansho-optimized-leaf.md`。
due:
last_touched: 2026-08-17
---

# ラクリス（lead-harvest webapp）— status

## 対話型・与件分解「入口スライス」実装 → 本番稼働（2026-08-08 実装 / 2026-08-17 デプロイ）
ふわっとした与件を対話でシグナルに落とし込む機能の**第 1 スライス（入口＋対話のガワ）**を実装・E2E 検証・**push 済み → Vercel 本番で対話稼働確認済み**（Sora が Vercel env に `GEMINI_API_KEY` 追加）。コミット: 全体 spec `2560efc` / 入口スライス `b608eaa` / 503 リトライ修正 `b25efd0`。
- **本番運用の前提**: Vercel env `GEMINI_API_KEY` 追加済み（未追加だと `/api/chat` が「GEMINI_API_KEY 未設定」502）。ローカルは `web/.env.local` にあり即動く。
- **503/429 対策（`b25efd0`）**: `callGemini` を最大 4 回バックオフ再試行 + 前半 flash → 後半 flash-lite フォールバックに変更。503 UNAVAILABLE（Gemini 過負荷）を対話中に極力見せない。失敗時は生 JSON でなく読みやすいメッセージ。
- **要件定義（brainstorming 完了）**: `docs/spec-dialogue-decompose.md`（全体像）＋ `docs/spec-dialogue-entry.md`（本スライス）。設計の核 = lead-harvest の Stage -2/-1/0（signal-catalog）を対話 UI に移植。落とし込みロジック = 現在地特定 → ペイン→シグナル変換(7軸) → ガードレール3つ → N 仮説。出口 = 1 仮説=1 ジョブ / 走らせ方選択 / `hypothesis_set_id` グルーピング（次スライス）。
- **本スライスのスコープ**: 入口二択（決まってる→従来フォーム / ふわっと→対話）＋ 対話画面の器（左メッセージ＋入力・右 要件カード枠）＋ `/api/chat` 同期 Gemini 1 往復。**シグナル頭脳の構造化抽出・N 仮説・ジョブ生成・DB 変更・worker 変更は次スライス**。
- **アーキ**: 対話は web 側同期 Gemini（`web/src/lib/gemini.ts` = worker `decompose.py` の `_gemini_json` を TS 写経・SDK 無し fetch 直叩き・`x-goog-api-key` ヘッダ・429 で flash→flash-lite）。実ソース発見は既存 worker のまま（対話は"方向づけ"まで＝Level 1、実 URL 断定禁止で幻覚回避）。
- **新規/変更**: `web/src/lib/gemini.ts`（新）/ `web/src/app/api/chat/route.ts`（新・maxDuration=60）/ `web/src/components/EntryPicker.tsx`（新）/ `web/src/components/ChatCompose.tsx`（新）/ `api-types.ts`（ChatMessage/ChatReply）/ `Console.tsx`（modalOpen→mode 二択）/ `globals.css`（picker/chat/bubble/reqcard）/ `.env.local.example`（GEMINI_API_KEY 追記）。
- **検証済**: `npx tsc --noEmit` 0 / `pnpm build` 緑 / `/api/chat` 実 Gemini 往復（単発・history マルチターン・空 message 400）/ ブラウザ E2E（二択→対話→実往復で Move 1「現在地特定＋ペイン深掘り 3 点」挙動を確認）。GEMINI_API_KEY は `web/.env.local` に既存でローカル即動く。
- **残（次スライス）**: 要件カードの構造化ライブ更新 / N 仮説カード＋走らせ方選択 / 共通フォーム / `hypothesis_set_id`+`decomp` の DB 列 / worker の decompose_brief スキップ分岐 / 比較ビュー。**本番で対話を使うなら Vercel env に `GEMINI_API_KEY` 追加が必要**。

## 対話の頭脳リデザイン + 対話→リスト作成 一気通貫（2026-08-17・push 済み）
対話まわりを大きく前進。**全て web 側のみ（schema/worker/デプロイ変更なし）**で push 済み（`62d659a`..`8a8f27d`）。
- **スクロール修正**: `.chatbody` に `grid-template-rows: minmax(0,1fr)` ＋ `.chatmain` に `min-height:0`。器を86vh固定・中の対話だけスクロール（grid item が伸びて `.msgs` の overflow が発火しない罠）。
- **対話を提案型に全面書き換え**（`SIGNAL_SYSTEM_PROMPT`）: 質問攻め → 「経験則に裏打ちされた仮説・選択肢を先出し、ユーザーは Yes/No で反応」。**役割分担 = 人間は 便益→業界/セグメント→規模 まで／AI がシグナル軸・ソースを自動導出**（[[feedback_two_meta_axes_brainstorm]]）。**最初の提案は業界/セグメント単位で先出し**（部署は抽象なので後段の到達絞り込みで使う）。
- **営業プレイブック新規＝対話AIの頭脳の正本**: `docs/playbook.md`。Sora への think-aloud（UACJ案件）で抽出。**Layer 1 = 思考プロセス**（便益を1つ掴む→ニーズある業界を先出し→規模/到達で絞る→広ければ別リストで並列→AI がシグナル/ソース添える）＋各手の隠れルール。**Layer 2 = 到達の経験則**（1,000人以下=代表TELで到達しやすい／大手=部署・バイネーム必須／病院◎・美容クリニック△・化粧品×/コスメ○／有名ブランド商材は到達↑）。`gemini.ts` のプロンプトはこの写経（当面二重管理）。
- **一気通貫（対話→要件抽出→作成プラン提示→ジョブ生成）**: フッタ「この要件でリスト作成へ」→ `/api/chat/extract`（新・Gemini JSONモード `callGeminiJson`）で構造化要件＋作成プラン抽出 → 要件カード確定＋プラン提示 →「この内容で作成を開始」で **レシピ無しジョブ生成 → 既存 worker 自走経路に合流**。到達性由来の収集項目を `jobs.columns`（既存jsonb・db:push不要）に書込。`ChatCompose` の `onCreated` を `Console` で配線（キュー更新＋詳細を開く）。
- **パターンC回避**: 実機で worker の `decompose_brief` が「複数業界横断×動的シグナル」を**パターンC（1社ずつWebリサーチ）と判定→現フェーズ未対応で error**（LH-A05 で確認）。対策＝対話/抽出プロンプトに**「パイプライン制約」=単一ソースで一覧化できる A/B の形に寄せる**を追加（複数業界→最有望1業界、求人→1ポータル検索一覧）。実Geminiで「家電・食品・化粧品3業界」→「食品メーカー1業界＋求人ポータル」に自動narrowing確認。**完全排除は worker のパターン判定側＝Phase 2（worker 再デプロイ）**。
- **新規/変更**: `docs/playbook.md`(新) / `web/src/app/api/chat/extract/route.ts`(新) / `gemini.ts`(EXTRACT_SYSTEM_PROMPT＋callGeminiJson＋提案型書換＋パイプライン制約) / `ChatCompose.tsx`(一気通貫UI) / `Console.tsx`(onCreated配線) / `api-types.ts`(ExtractResult) / `api/jobs`＋`queries.ts`(columns受け皿) / `globals.css`(スクロール)。**tsc 0 / build 緑 / `/api/chat/extract` 実Gemini通貫確認済**。
- **残（Phase 2）**: 構造化 decomp を worker に渡す精度厳密化（`jobs.decomp` 列＋worker スキップ分岐＋再デプロイ → パターンC完全排除も同時）／N仮説→並列＋`hypothesis_set_id` 比較ビュー／専用作成プラン確認モーダル。計画=`~/.claude/plans/users-sorasasaki-desktop-inbox-cleansho-optimized-leaf.md`。

## AI 与件分解（Gemini + Brave）実装・実コール検証済み（2026-08-03）
対話版 lead-harvest の「頭脳」（Claude Code=サブスク定額が担当）を、ヘッドレス worker から使えるよう **Gemini 2.5 Flash + Brave Search** で外付け。従量課金の Claude API は不採用（Sora 判断）。**スコープ = パターン A（与件→ソース発見→レシピ自動生成）**。C/D per-company エンリッチは後段。
- **Gemini と Brave の分担**: 「考えるのは Gemini、実在するものは Brave/worker が掴む」。**Gemini に URL を名指しさせると幻覚する**（検証で SUUMO の sitemap 捏造を確認）→ Gemini=検索クエリ/url_pattern/抽出正規表現の推論、Brave 検索+worker の sitemap 探索=実在 URL 確定。
- **フロー**: レシピ無しで起票 → web `createJob` が `runs(kind='decompose')` を自動投入 → worker: ①与件分解+パターン判定（既存レシピマッチも同時）→ ②Brave 検索でソース候補→robots.txt/sitemap から企業ページ URL 収集 → ③url_pattern 推論 → **三段ゲート**（企業ページ≥40 / pattern が実 loc にマッチ / 複数ページで別会社）→ ④実 HTML から抽出レシピ生成+自己検証（候補最大5件を順に試す）→ recipes upsert・job 紐付け → **dryrun 自動投入**（分解〜試走まで自走）→ GO 待ち画面で Sora 承認 → 本番。
- **確認点 = dryrun ゲートのみ**。**レシピ生成 = ハイブリッド**（既存マッチ優先→無ければ Brave 発見+生成）。C/D は「未対応」明示で error 停止。
- **配置**: AI は worker 側（Python・Mac ローカル）。HTML fetch 同所／APIキーを Mac に保持／疎結合維持。Gemini は REST 直叩き（新規 dep 無し）・timeout 45s+1リトライ・429 は flash→flash-lite。Brave は既存 `find_sites.brave_key/brave_search` 再利用。
- **新規/変更ファイル**: `worker/decompose.py`（新）/ `worker/run_worker.py`（decompose 分岐+dryrun自動投入+recipe upsert）/ `worker/.env.example`（GEMINI/BRAVE）/ `web/src/lib/queries.ts`（createJob 自動投入）/ `api-types.ts`（RunDTO.kind に decompose）/ `NewJobModal.tsx`（文言）。DB マイグレーション不要。
- **実コール検証済**: 既存経路「美容師求人」→hotpepper マッチ ✅ ／ 新規経路「リフォーム会社」→ Brave 発見で **ホームプロ(homepro.jp・企業ページ1032件)を自動採用** ✅（比較記事ブログ/小規模sitemap/自己検証失敗を三段ゲートで自動排除）。tsc/py_compile/オフラインunit 緑。
- **要 env（worker/.env）**: `GEMINI_API_KEY` + `BRAVE_API_KEY`（両方投入済み）。
- **UI 進捗可視化（2026-08-03 追加・push 済み d52579a）**: detail 上部に **5段フェーズバー**（与件分解→試走→GO判断→本番→完了・現在地をハイライト）。与件分解画面は古い「Phase 3」文言を撤去し、**worker 未起動時「ワーカー起動待ち」+起動コマンド表示**／実行中はライブログ（Gemini/Brave の進捗）を表示。`Console.tsx` PhaseBar/EventsLog、`globals.css` .phasebar。※「動いてない」の主因は **worker 未起動**（decompose run が queued のまま）＝Mac で `cd worker && .venv/bin/python run_worker.py` を起動すれば処理が進む。
- **上位計画**: `~/.claude/plans/users-sorasasaki-work-os-02-projects-ra-zesty-wombat.md`

## 現在のフェーズ
**本番デプロイ完了・共有 URL 稼働中**（https://rakurisu.vercel.app・デモ公開・ログイン無し・noindex）。GitHub private repo `sky0508/rakurisu` + Vercel（Hobby / 個人 Gmail アカウント・git 連携で main push→自動デプロイ）。

## git 連携 + Vercel デプロイ完了（2026-08-03）
- **GitHub**: `sky0508/rakurisu` を **private** で作成し push 済み。認証は `gh auth login --with-token` が `read:org` 不足で弾かれたため **`GH_TOKEN=<PAT> gh repo create --private --source=. --push` で回避**（PAT は `repo` のみでも作成/push 可）。使用した PAT はチャット露出のため **revoke 済み** → 次に CLI push するときは **`repo` + `read:org` 両方**付けた新 PAT を作れば `--with-token` が一発で通る。
- **Vercel**: Root Directory=`web`（初回 import で設定漏れ→後から Settings で修正して Redeploy）。env は import 時に飛んでいたため **`web/.env.local` を Import .env / paste で一括投入**（7キー、3環境チェック）。`NEXT_PUBLIC_APP_URL` は本番URLに修正。`PUBLIC_DEMO=1` 投入 + Redeploy で `/` の 307→200（デモゲート解除）を確認。`/api/jobs` が Neon 実データ（LH-SMOKE）を返すことも確認。
- **worker は未起動**: 既存 LH-SMOKE 1件は Neon にあるので URL は見れるが、**新規ジョブ実行には worker を Mac 常駐で起動**（`DEPLOY.md` §6・同じ Neon を poll）する必要あり。
- **env Tips**: Vercel の env 変更は **Redeploy しないと反映されない**（Build Cache 外し推奨）。新 UI の環境変数は Settings → **Environments → 各環境（Production 等）をクリック**した先にある。ローカル .env を **`pbcopy` でクリップボード投入**すると値をチャットに出さず貼れる。

## 現在のフェーズ（旧）
フルスタック MVP 完成 + 通貫検証済み + **統合済み（1 repo）**。ローカルで **ログイン無しデモが稼働**（`PUBLIC_DEMO=1`）。

## 次セッション TODO（2026-08-03 合意）
1. **git 連携**: `sky0508/rakurisu` を作成し push。gh は device code 期限切れ ×2 のため **token 方式**（PAT `repo` スコープ → `gh auth login --with-token`）。secret 3種（.env.local / worker/.env / .next 等）は非追跡を維持
2. **Vercel デプロイ（web のみ）**: Vercel に env 投入（`DATABASE_URL` / `SESSION_SECRET` / `GOOGLE_*` / `NEXT_PUBLIC_APP_URL`=本番 URL / `PUBLIC_DEMO`）→ web をデプロイし共有 URL 化。worker は Mac 常駐のまま同じ Neon を共有。詳細手順は `DEPLOY.md`
3. デモ充実（任意）: done/running 等の状態を実データでシード（今は LH-SMOKE 1 件のみ）
- 認証は当面 **C（PUBLIC_DEMO・ログイン無し・noindex）** でデモ共有。恒久方針は spec §11-2 で再確定

## 統合・現況更新（2026-08-03）

- **統合完了**: モック＋docs だけの `rakurisu/` と、実装本体 `rakurisu/` を **1 リポジトリ `rakurisu/` に統合**（web/ + worker/ + docs/ + SETUP/DEPLOY + brand + docs/mock.html）。旧 `rakurisu/` は削除。git 履歴は rakurisu 側を継続。
- **env 現況**: `web/.env.local` は 7 キー投入済み（DATABASE_URL/SESSION_SECRET/GOOGLE_*×3/ALLOW_DOMAIN/NEXT_PUBLIC_APP_URL）。`worker/.env` も DATABASE_URL 済み。Neon 作成・`db:push`・`seed:recipes` 済み。→ **下の「次のアクション」1〜5,7 は完了**。残るは Sora の Google ログイン + 実ジョブ。
- **【要判断】認証方針**: Sora 指示「**誰でも閲覧できるように**」。現状は Google OAuth + `ALLOW_DOMAIN` 限定。leads=実在企業の電話リスト（AlphaDrive 業務データ）のため、**「誰でも」の水準を確定してから実装**（完全公開 / Google ログイン要・ドメイン不問 / URL＝鍵）。spec §11-2 参照。
- **dev server / デモ**: web/ 移動後に `.next` を掃除して Turbopack パニック解消。`PUBLIC_DEMO=1`（`web/.env.local`）で **proxy.ts の認証ゲートを外し、ログイン無しで `/`→コンソール表示**。noindex 済み（`app/layout.tsx` robots）。localhost:3060 で `/`=200・`/api/jobs`=Neon 実データ（LH-SMOKE 1件）を確認。認証を戻すなら `PUBLIC_DEMO=0`
- **GitHub/共有**: まだローカル git のみ（push 未）。次セッションで token 方式 push + Vercel デプロイ（上「次セッション TODO」）。

## 通貫検証（2026-07-31・実データ）
- Neon: `pnpm db:push`（strict は TTY 不可のため一時 false で適用→戻した）+ `seed:recipes`（hotpepper 投入）済み
- ワーカースモーク（hotpepper limit 5）: crawl 5社 / find_sites 5/5=100% / extract_phones 2/5=40% / leads 5件 / run=done・job=dryrun(GO待ち)。**A/B 通貫が実データで動作**
- 修正: worker venv に `requests` 追加（find_sites/upload_sheet が使用）
- セキュリティ: `.env.local.example` に一時混入した実 secret をプレースホルダへ回収（未コミットで無害化・値は `.env.local` に保全）
- 残: Sora の Google ログイン（interactive）→ UI から本番 40件

## 認証方針（2026-08-03 変更）
- **ドメイン制限を外した** → `ALLOW_DOMAIN` は任意（未設定＝どの Google アカウントでもログイン可）。callback は env があれば絞る実装。
- ⚠ 真の関門は **GCP OAuth 同意画面**：Internal だと外部アカウント不可。「誰でも」にするには **External + Publish**（scope は openid/email/profile の非機密のみ＝審査不要で即公開可）。
- 「ログイン自体なし（完全公開）」にするかは保留（実クロール＝コスト走るので認証は残す推奨）。

## プロジェクト名
2026-08-03 に dir を `lead-harvest-web` → **`rakurisu`** にリネーム（`02_projects/rakurisu/`）。web の package name は元から rakurisu。worker の REPO_ROOT/SKILL_DIR は work-os root 起点なので無影響。

## 実装済み（2026-07-31）
- **スタック**: Next 16 + React 19 + Tailwind v4 + Drizzle(Neon/postgres-js) + iron-session + Google ドメイン認証 + pnpm。ポート 3060。
- **認証**: proxy.ts ガード（middleware ではない）/ Google OAuth start・callback・logout / ドメイン allowlist / 最初の登録者=admin。ログインのみ scope（Sheets はワーカーが自前 token）。
- **UI**: quiet-product パターンで React 移植（sidebar / queue / detail 4状態=draft・running・dryrun・done・error + decompose拡張口 / 新規ジョブ modal）。実名ラクリス + リスアイコン(base64)。globals.css にトークン集約。
- **DB**: `drizzle/schema.ts`（users / recipes / jobs / runs / run_stages / leads / events）。
- **API**: GET/POST /api/jobs、GET /api/jobs/[id]、POST /api/jobs/[id]/runs、GET /api/recipes。SWR ポーリング配線。
- **ワーカー**: `worker/run_worker.py`（Neon poll → skill の4スクリプトを subprocess → stdout parse → run_stages/events/runs/leads 書き戻し）。dryrun=crawl/find_sites/extract_phones→GO待ち、production=+upload→done。psycopg。
- **検証**: `npx tsc` 0 エラー / `pnpm build` 緑（全ルート + proxy）/ `/login` 実機レンダリング確認（quiet デザイン + アイコン）/ `/`→`/login` 307 リダイレクト（ガード動作）。worker `py_compile` OK。

## 次のアクション（Sora の停止境界）
1. **Neon**: project 作成 → `DATABASE_URL`（末尾 `?sslmode=require`）
2. **Google OAuth**（GCP）: client id/secret、redirect `http://localhost:3060/api/auth/google/callback`、`ALLOW_DOMAIN`（例 marchon.co.jp）
3. **秘密**: `SESSION_SECRET`(32+, `openssl rand -hex 32`)。値に `$` が入る場合はシングルクォート必須（[[feedback_dotenv_dollar_expansion]]）
4. `web/.env.local` に投入（`.env.local.example` 参照）
5. `cd web && pnpm db:push`（スキーマを Neon へ）→ `pnpm seed:recipes`（skill の hotpepper レシピ投入）
6. `pnpm dev` → ログイン → 新規ジョブ（hotpepper レシピ選択）→ 試走 40件 を実行
7. 別ターミナルで `cd worker && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && DATABASE_URL=... python3 run_worker.py --once`
8. UI が実行中→試走取得率→leads プレビューを表示すれば通貫 OK
   - `BRAVE_API_KEY` 無 → Stage2 スキップ（法人リストまで）。gsheets token 無 → CSV のみ。

## デザイン
- 正: `docs/DESIGN.md`（quiet-product）+ `.claude/skills/rich-webapp-design/references/pattern-quiet-product.md`
- 実物モック: `07output/ui/20260730_lead-harvest-console-quiet.html`
- ※ precision 版（`20260730_...-precision.html`）は不採用（AIっぽい失敗版として feedback に記録）

## ドキュメント
- ローカル起動: `SETUP.md`
- 本番デプロイ & env（3箇所: web ローカル / Vercel / worker）: `DEPLOY.md`
- 設計の正: `docs/DESIGN.md` / 上位計画・仕様: `docs/spec.md`

## 主要パス
- Web: `02_projects/rakurisu/web/`（src / drizzle / scripts / docs）
- ワーカー: `02_projects/rakurisu/worker/`
- 呼ぶ Python（無改変）: `.claude/skills/lead-harvest/scripts/*` + `recipes/*.json`
- 上位計画: `~/.claude/plans/rakurisuapp-ui-claude-bubbly-tiger.md`

## 拡張口（Phase 3+）
- ~~与件分解 / パターン判定（Gemini）~~ → **2026-08-03 実装済み（上部参照）**
- C/D 並列リサーチの API 化（件数比例課金の主戦場・後段スコープ）
- レシピ生成失敗時の UI 上での手動編集・再分解ボタン
- Claude 逃がしの実配線（現状 flag 相当の思想のみ・未配線）
- Vercel デプロイ（web のみ。ワーカーは Mac 常駐のまま）
