# ラクリス 実装計画（plan）— 案 B / P1

> ステータス: **ドラフト（Sora レビュー待ち）** / 2026-07-31
> 前提: `docs/spec.md` §7 で **案 B（DB 集約 + ローカル実行）** 確定。本書は P1（社内が状態を閲覧できる MVP）の how。

---

## 0. 方針（まず結論）

- webapp は **Next.js 16 + Neon(Postgres) + Drizzle + iron-session**（apo-report / saimu / cockpit と同じ既存パターン）
- **状態は Neon に集約**。ローカルの lead-harvest 実行が Neon に書き、Vercel の webapp が読む
- **既存 Python パイプラインは改造しない**。ラクリス側に**報告シム**（薄い Python）を足し、実行を包んで stage 境界で Neon に upsert する（成熟したバックエンドに手を入れず、リスクを rakurisu 側に閉じる）
- 現 `index.html`（モック）は **デザインの正**として `docs/mock.html` に退避。P1 は実装しながらこれに寄せる
- P1 のゴールは **「閲覧」**（他の人が今の進捗を見られる）。起票・実行キックは P2

## 1. リポジトリ進化

```
rakurisu/
  app/                 ← Next.js（新規）
  lib/{db,session}.ts  ← Neon(Drizzle) + iron-session
  drizzle/             ← schema + migrations
  runner/lh_sync.py    ← 案件 data dir → Neon 同期（P1b）
  runner/lh_run.py     ← 実行ラッパ（P2）
  docs/{spec,plan,DESIGN,mock.html}
  brand/  README.md  status.md
```
- Vercel は静的モックから **同一プロジェクトを Next.js ビルドに切替**（framework=Next.js）。P0 の共有 URL がそのまま P1 に育つ

## 2. Neon スキーマ（P1 最小）

```sql
-- ジョブ = 1 リスト作成案件
jobs(
  id            text primary key,     -- 案件スラッグ（例 LH-A08 / innai-baiten）
  title         text not null,
  use_case      text not null,        -- 架電営業 / DM / …
  pattern       text,                 -- A/B/C/D/未定
  target        int,                  -- 目標納品件数
  state         text not null,        -- queued/decompose/dryrun/running/done/failed
  quality_bar   jsonb,               -- {metric:'phone', bar:85}
  case_dir      text,                 -- リスト作成/<案件>/ への相対パス
  created_at, updated_at  timestamptz
)
-- stage 進捗（母集団/サイト/電話/出力）
job_stages(
  job_id text references jobs(id),
  stage  text,                        -- collect/find_sites/extract_phones/output
  status text,                        -- ok/running/todo/failed
  count  int, pct int, note text,
  updated_at timestamptz,
  primary key(job_id, stage)
)
-- 納品物
deliverables(job_id, kind, url, created_at)   -- kind: sheet/csv/meta
-- 実測メトリクス（done 時のサマリー）
job_metrics(job_id, key, value)               -- phone_rate/site_rate/tier_s…/flags
```
- Drizzle でスキーマ定義 → `drizzle-kit` で Neon にマイグレーション
- 決定事項: **`jobs.id` = 案件スラッグ**（spec §10-3）。既存の `リスト作成/<案件>/` ディレクトリ名を採用

## 3. ローカル → Neon 報告シム

### P1b `runner/lh_sync.py`（非侵襲・まず手動同期）
- 入力: 案件 data dir（`with_phones.jsonl` 等）+ 案件メタ
- 動作: JSONL と `/tmp/lh_crawl.log` から現状態を導出 → `jobs`/`job_stages`/`deliverables`/`job_metrics` を **upsert**
- 使い方: `python3 runner/lh_sync.py --case リスト作成/innai-baiten --job-id innai-baiten`
- これで**過去/進行中の実案件を即 webapp に載せられる**（P1 の閲覧が成立）

### P2 `runner/lh_run.py`（実行ラッパ・ライブ更新）
- 既存 4 スクリプトを subprocess で順に叫び、各 stage の前後で Neon を upsert（running→ok）
- webapp 起票（`jobs.state=queued`）を polling して実行 → P2 で作る

## 4. webapp（Next.js）

- **読み取り専用**（P1）。Server Components で Neon を直読み（apo-report と同じ）
- 画面 = モック `docs/mock.html` の 4 state をそのまま移植:
  - 一覧（ジョブキュー）: `jobs` を state タグ付きで
  - 詳細: state 別に job_stages / job_metrics / deliverables を描画
- **認証**: iron-session の共有パスワードゲート（社内に 1 つ配る）。マルチユーザー/権限は非スコープ
- DESIGN.md のトークンを Tailwind config + CSS 変数に落とす（quiet-product 準拠、最低ライン厳守）

## 5. P1 実装ステップ（順序）

1. Next.js 16 scaffold（App Router, TS, Tailwind）+ DESIGN トークン移植・モックを `docs/mock.html` に退避
2. Drizzle スキーマ（§2）+ `lib/db.ts`
3. iron-session パスワードゲート（`lib/session.ts` + `/login`）
4. 一覧 + 詳細（4 state）を Neon 読み取りで実装（まずシード JSON で見た目確認）
5. `runner/lh_sync.py`（§3）で実案件 1 本を Neon に流し、実データ表示を確認
6. Vercel デプロイ（既存プロジェクトを Next.js 化）→ 社内共有

## 6. Sora がやること（停止境界・外部/認証）

- **Neon プロジェクト作成** → `DATABASE_URL` を発行（Sora の marchon or 個人。lead-harvest は AlphaDrive 案件なので marchon 推奨だが要判断）
- **Vercel env 設定**: `DATABASE_URL` / `SESSION_SECRET` / 共有パスワード
- （既に済）GitHub 認証 → repo push は別途

## 7. 残る決定（実装前に潰す）

1. `queued` / `failed` を P1 に含めるか（含める推奨。監視の価値の大半が「異常検知」）
2. Neon は **marchon / 個人**どちら（AlphaDrive 業務データ性 → marchon 寄り。Sora 権限は member）
3. 認証は共有パスワード 1 個で十分か（社内配布の運用と合わせて）
4. 案件 data dir を rakurisu からどう参照するか（同期は Sora の Mac 上で走る前提でよいか）

## 8. 非スコープ（P1 では作らない）
- webapp からの実行キック（→ P2 `lh_run.py`）
- 与件分解の実キック・Stage 5 検証（→ P3）
- マルチユーザー・ロール権限
