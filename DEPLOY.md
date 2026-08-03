# ラクリス 本番デプロイ & 環境変数

「env を入れる所がローカルしかない」問題への回答。**env を入れる場所は 3 つある**。
本番構成は「web は Vercel・worker は Mac 常駐・両者は同じ Neon を共有」。

---

## 1. 本番の構成

```
[ユーザーのブラウザ]
        │ https
        ▼
[Vercel] Next アプリ web/          ← env は Vercel の管理画面に入れる
        │ enqueue / 状態表示
        ▼
[Neon Postgres]  ← production ブランチ（web と worker で共有）
        ▲
        │ poll / 書き戻し
[Mac 常駐] Python ワーカー worker/  ← env は worker/.env（ローカル）に入れる
```

**なぜ worker は Vercel に載せないのか**: ワーカーは (1) 数十分かかるクロールを回す、(2) ローカルの `curl` / `BRAVE_API_KEY` / Google Sheets トークンを使う。Vercel の serverless 関数は数十秒で切れ、ローカルのキーも持てない。だから実行はローカル（or 常時起動の小さいホスト）に置き、Vercel の web とは Neon 経由でつながる。

---

## 2. env を入れる 3 つの場所

| どこ | ファイル / 画面 | 何に使う | 主な変数 |
|---|---|---|---|
| **web ローカル開発** | `web/.env.local` | `pnpm dev`（localhost:3060） | 下の全部（localhost 値） |
| **web 本番** | **Vercel → Project → Settings → Environment Variables** | Vercel 上の web | 下の全部（本番 URL 値） |
| **worker（Mac 常駐）** | `worker/.env`（`.env.example` あり） | `run_worker.py` | `DATABASE_URL` と任意キーだけ |

worker は `worker/.env` を自動で読む（依存なしローダー実装済み）。web の `.env.local` と **DATABASE_URL は同じ値**にする。

### 変数マトリクス（どの変数をどこに）

| 変数 | web ローカル | Vercel(本番) | worker | 値の違い |
|---|:---:|:---:|:---:|---|
| `DATABASE_URL` | ✅ | ✅ | ✅ | 3 箇所とも**同じ Neon** |
| `SESSION_SECRET` | ✅ | ✅ | — | 同じ 32+ 文字でよい |
| `GOOGLE_CLIENT_ID` / `_SECRET` | ✅ | ✅ | — | 同じ（GCP の 1 クライアント） |
| `GOOGLE_REDIRECT_URI` | localhost | **本番ドメイン** | — | 環境ごとに違う |
| `ALLOW_DOMAIN` | ✅ | ✅ | — | 同じ（例 marchon.co.jp） |
| `NEXT_PUBLIC_APP_URL` | localhost | **本番ドメイン** | — | 環境ごとに違う |
| `BRAVE_API_KEY`（任意） | — | — | ✅ | worker だけ |

---

## 3. Vercel に web をデプロイ

### 3-1. プロジェクト作成
1. https://vercel.com/ → **Add New → Project** → この Git リポジトリを import
2. **Root Directory** を `02_projects/rakurisu/web` に設定（重要。モノレポの web/ を指す）
3. Framework: Next.js（自動検出）。Build/Install はデフォルト（pnpm 自動）

### 3-2. 環境変数（Vercel 画面で入れる）
**Settings → Environment Variables** に以下を追加。**Production / Preview / Development の 3 環境すべてにチェック**を入れる（1 つでも抜けると本番だけ落ちる罠。[[feedback_nextjs_vercel_supabase_deploy]]）:

```
DATABASE_URL          = （Neon production の Pooled 接続文字列。sslmode=require 付き）
SESSION_SECRET        = （openssl rand -hex 32 の 64 文字）
GOOGLE_CLIENT_ID      = ...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET  = ...
GOOGLE_REDIRECT_URI   = https://<本番ドメイン>/api/auth/google/callback
ALLOW_DOMAIN          = marchon.co.jp
NEXT_PUBLIC_APP_URL   = https://<本番ドメイン>
```
> 値の頭に `$` が入る場合の展開罠は Vercel 画面では起きない（.env ファイル固有）。ローカルの `.env.local` だけシングルクォート注意。

### 3-3. デプロイ
Deploy を押す → 本番ドメイン（`https://rakurisu-xxx.vercel.app` 等）が出る。

---

## 4. GCP OAuth を本番ドメインに対応

ローカルの redirect だけだと本番でログインできない。**GCP に本番 URI を追加**:

1. GCP → APIs & Services → Credentials → 該当 OAuth client を開く
2. **Authorized redirect URIs** に**追加**（ローカルの行は残す）:
   ```
   https://<本番ドメイン>/api/auth/google/callback
   ```
3. OAuth 同意画面が **External** の場合は **Publish app**（Internal（marchon Workspace）なら不要）
4. 独自ドメインを当てたら、その `https://独自ドメイン/api/auth/google/callback` も追加

---

## 5. スキーマ投入（本番 Neon へ）

`db:push` は**ローカルから本番 Neon に対して**流す（Vercel のビルドでは流さない）:

```bash
cd 02_projects/rakurisu/web
# 一時的に本番 DATABASE_URL を使って push
DATABASE_URL='（Neon 本番の接続文字列）' pnpm exec drizzle-kit push
DATABASE_URL='（Neon 本番の接続文字列）' pnpm exec tsx scripts/seed-recipes.ts
```
> `.env.local` を本番用に書き換えて `pnpm db:push` でも可。ブランチを分ける運用にするなら Neon の production ブランチを指す。

---

## 6. worker を本番運用（Mac 常駐）

### 6-1. env を worker/.env に置く
```bash
cd 02_projects/rakurisu/worker
cp .env.example .env
# .env を開いて DATABASE_URL（本番 Neon・web と同じ値）を入れる。任意で BRAVE_API_KEY。
```

### 6-2. 常駐させる（2 択）

**(a) 手軽: nohup + caffeinate**（ログアウトしなければ生存）
```bash
cd 02_projects/rakurisu/worker
source .venv/bin/activate
nohup caffeinate -i python3 run_worker.py > /tmp/rakurisu_worker.log 2>&1 &
```

**(b) 恒久: launchd**（再起動しても自動で上がる）
`~/Library/LaunchAgents/com.sora.rakurisu-worker.plist` を作る:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.sora.rakurisu-worker</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/sorasasaki/work-os/02_projects/rakurisu/worker/.venv/bin/python3</string>
    <string>/Users/sorasasaki/work-os/02_projects/rakurisu/worker/run_worker.py</string>
  </array>
  <key>WorkingDirectory</key><string>/Users/sorasasaki/work-os/02_projects/rakurisu/worker</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/rakurisu_worker.log</string>
  <key>StandardErrorPath</key><string>/tmp/rakurisu_worker.err.log</string>
</dict>
</plist>
```
```bash
launchctl load ~/Library/LaunchAgents/com.sora.rakurisu-worker.plist   # 起動
launchctl unload ~/Library/LaunchAgents/com.sora.rakurisu-worker.plist # 停止
```
> launchd は env を継承しないので `worker/.env`（自動ロード）に DATABASE_URL を必ず入れておく。

### 6-3. 将来: 常時ホストに移すなら
Mac を閉じても回したくなったら、worker だけ小さい常時起動ホスト（Fly.io / Railway / Render の worker、または VPS）に移す。コードはそのまま・`DATABASE_URL` を同じ Neon に向けるだけ。Vercel には**載せない**（serverless では長時間ジョブが切れる）。

---

## 7. デプロイ後チェックリスト

- [ ] Vercel の env を Production/Preview/Development の 3 環境に入れた
- [ ] GCP に本番 redirect URI を追加した（External なら publish 済み）
- [ ] 本番 Neon に `db:push` + `seed:recipes` した
- [ ] 本番ドメインで Google ログインできる（redirect_uri_mismatch が出ない）
- [ ] worker/.env に本番 DATABASE_URL を入れ、Mac で常駐起動した
- [ ] 本番でジョブ作成→試走→worker が拾って画面が更新される

---

## 8. よくある詰まり（本番特有）

| 症状 | 対処 |
|---|---|
| ローカルは動くが Vercel でだけ 500 | env が Production 環境に入っていない（3 環境チェック）。または Server Component の build 時評価。routes は force-dynamic 済み |
| `redirect_uri_mismatch`（本番） | GCP に本番 URI 未追加、または `GOOGLE_REDIRECT_URI` が本番ドメインでない |
| 本番でログインしてもすぐログアウト | `SESSION_SECRET` が Vercel 未設定 or ローカルと別値でプレビュー/本番不一致 |
| Vercel で DB 接続数エラー | Neon の **Pooled**（-pooler ホスト）を使う。direct 接続だと serverless で枯れる |
| ジョブが queued のまま動かない | worker が起動していない / worker の DATABASE_URL が本番 Neon を向いていない |
| Mac スリープで worker が止まる | `caffeinate -i` 付き、または launchd + `caffeinate`。長時間クロールは caffeinate 必須 |

---

## 9. まとめ（env の置き場所だけ再掲）

- **web ローカル** → `web/.env.local`
- **web 本番** → Vercel の Environment Variables 画面
- **worker（本番も）** → `worker/.env`（Mac ローカル。Vercel には行かない）
- **DATABASE_URL は 3 箇所とも同じ Neon**。それが web と worker をつなぐ唯一の線。
