---
name: rakurisu
status: active
next_action: 次セッション — ① git 連携（GitHub push、gh は token 方式）② Vercel に env 投入 → web をデプロイし共有 URL 化（worker は Mac 常駐・Neon 共有）。ローカルデモは PUBLIC_DEMO=1 で稼働中。
due:
last_touched: 2026-08-03
---

# ラクリス（lead-harvest webapp）— status

## 現在のフェーズ
フルスタック MVP 完成 + 通貫検証済み + **統合済み（1 repo）**。ローカルで **ログイン無しデモが稼働**（`PUBLIC_DEMO=1`）。次は GitHub push + Vercel デプロイで共有 URL 化。

## 次セッション TODO（2026-08-03 合意）
1. **git 連携**: `sky0508/rakurisu` を作成し push。gh は device code 期限切れ ×2 のため **token 方式**（PAT `repo` スコープ → `gh auth login --with-token`）。secret 3種（.env.local / worker/.env / .next 等）は非追跡を維持
2. **Vercel デプロイ（web のみ）**: Vercel に env 投入（`DATABASE_URL` / `SESSION_SECRET` / `GOOGLE_*` / `NEXT_PUBLIC_APP_URL`=本番 URL / `PUBLIC_DEMO`）→ web をデプロイし共有 URL 化。worker は Mac 常駐のまま同じ Neon を共有。詳細手順は `DEPLOY.md`
3. デモ充実（任意）: done/running 等の状態を実データでシード（今は LH-SMOKE 1 件のみ）
- 認証は当面 **C（PUBLIC_DEMO・ログイン無し・noindex）** でデモ共有。恒久方針は spec §11-2 で再確定

## 統合・現況更新（2026-08-03）

- **統合完了**: モック＋docs だけの `rakurisu/` と、実装本体 `lead-harvest-web/` を **1 リポジトリ `rakurisu/` に統合**（web/ + worker/ + docs/ + SETUP/DEPLOY + brand + docs/mock.html）。旧 `lead-harvest-web/` は削除。git 履歴は rakurisu 側を継続。
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
- 与件分解 / パターン判定（Gemini・repo の jva-internship-board gemini-reply.ts 流用）
- C/D 並列リサーチ（同時数上限ワーカー）
- Vercel デプロイ（web のみ。ワーカーは Mac 常駐のまま）
