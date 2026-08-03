# ラクリス セットアップ手順

lead-harvest webapp「ラクリス」を**ローカルで**初めて動かすまでの手順。**上から順に**進めれば通貫検証まで到達する。
クラウド/認証系（Neon・Google OAuth）は Sora の操作が要る箇所。それ以外はコマンドを貼るだけ。

> **本番（Vercel + Mac 常駐 worker）の env 設定は → [`DEPLOY.md`](./DEPLOY.md)**。env を入れる場所は「web ローカル / Vercel 画面 / worker」の 3 つある。

---

## 0. 全体像（3 つが登場する）

```
[ブラウザ] ──▶ [Next アプリ web/ :3060] ──enqueue──▶ [Neon Postgres] ◀──poll── [Python ワーカー worker/]
              Google でログイン・ジョブ作成          共有キュー兼状態         実 Python を実行して書き戻し
```

- **web/** … 画面・認証・API。ローカル(:3060) or 後で Vercel。
- **worker/** … 実際のクロール等を動かす。**Sora の Mac で常駐**（curl / Brave キー / Sheets トークンをローカルに持つため）。
- **Neon** … 両者が読み書きする DB。

必要になる値（あとで `.env.local` に入れる）:

| キー                                          | 何            | どこで取る                     |
| ------------------------------------------- | ------------ | ------------------------- |
| `DATABASE_URL`                              | Neon 接続文字列   | Neon（Step 1）              |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth | GCP（Step 2）               |
| `GOOGLE_REDIRECT_URI`                       | 折り返し URL     | 固定値（Step 2）               |
| `ALLOW_DOMAIN`                              | ログイン許可ドメイン   | 自分で決める（例 `marchon.co.jp`） |
| `SESSION_SECRET`                            | Cookie 暗号鍵   | `openssl` で生成（Step 3）     |

前提ツール（確認済み）: Node v25 / pnpm 10 / Python 3.13。

---

## Step 1. Neon プロジェクトを作る → `DATABASE_URL`

1. https://console.neon.tech/ にログイン（marchon 用アカウント）
2. **Create project**（名前 `rakurisu`、region は Tokyo でよい）
3. できたら **Connection string** をコピー。**`Pooled connection` を選ぶ**（サーバーレス向き）
4. 末尾が `?sslmode=require` になっているか確認（無ければ付ける）

例: `postgres://<user>:<pass>@<host>-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`

> これが `DATABASE_URL`。**web と worker で同じ値**を使う。

---

## Step 2. Google OAuth を作る → client id / secret / redirect

ログイン（Google）に使う。ラクリスは **email・profile のみ**要求（Gmail/Drive は使わない）。

### 2-1. OAuth 同意画面
1. https://console.cloud.google.com/ → プロジェクト選択（無ければ新規 `rakurisu`）
2. 左メニュー **APIs & Services → OAuth consent screen**
3. User type:
   - **誰でもログインさせたい（現行の方針）→ External + Publish（本番公開）**。scope は openid/email/profile の非機密のみなので審査不要で即公開できる。External の Testing のままだと登録テストユーザー（最大100）しか入れない点に注意。
   - marchon 社内だけに絞るなら Internal（ただし外部アカウントは一切入れない）。
4. アプリ名 `ラクリス`、サポートメール（自分）だけ入れて保存
5. Scopes は **openid / userinfo.email / userinfo.profile** の 3 つ（追加不要な既定でOK）

### 2-2. 認証情報（クライアント ID）
1. **APIs & Services → Credentials → Create credentials → OAuth client ID**
2. Application type: **Web application**
3. **Authorized redirect URIs** に**この 1 行を正確に**追加（末尾スラッシュ無し）:
   ```
   http://localhost:3060/api/auth/google/callback
   ```
4. Create → **Client ID** と **Client secret** が出るのでコピー

> `GOOGLE_REDIRECT_URI` は上の URI と**完全一致**（後で Vercel に載せる時はドメイン分を足す）。
> `ALLOW_DOMAIN` は「ログインを許可するメールのドメイン」。例 `marchon.co.jp`。ここに一致しない Google アカウントは弾かれる。

---

## Step 3. セッション秘密鍵を生成 → `SESSION_SECRET`

ターミナルで:
```bash
openssl rand -hex 32
```
出た 64 文字をコピー。

> ⚠ 値に `$` が含まれることは無い（hex なので）が、`.env.local` に貼る値全般で **`$` を含む場合はシングルクォートで囲む**（dotenv が変数展開してしまう。[[feedback_dotenv_dollar_expansion]]）。

---

## Step 4. `web/.env.local` を作る

```bash
cd 02_projects/rakurisu/web
cp .env.local.example .env.local
```
`.env.local` を開き、Step 1〜3 の値を埋める:

```dotenv
DATABASE_URL=postgres://...neon-pooler...?sslmode=require
SESSION_SECRET=（openssl の 64 文字）
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3060/api/auth/google/callback
ALLOW_DOMAIN=marchon.co.jp
NEXT_PUBLIC_APP_URL=http://localhost:3060
```

---

## Step 5. スキーマ投入 + レシピ投入

```bash
cd 02_projects/rakurisu/web
pnpm install            # 済みならスキップ
pnpm db:push            # drizzle/schema.ts を Neon に反映（テーブル作成）
pnpm seed:recipes       # skill の recipes/*.json（hotpepper 等）を recipes テーブルへ
```
`pnpm db:push` が「Changes applied」で終わればOK。`seed:recipes` は `upserted recipe: hotpepper-beauty-work` 等が出る。

---

## Step 6. Web を起動してログイン

```bash
pnpm dev                # http://localhost:3060
```
ブラウザで http://localhost:3060 を開く → `/login` に飛ぶ → **Google でログイン** → 許可ドメインなら入れる。
（最初にログインした人が自動で admin になる。）

---

## Step 7. ワーカーを起動（別ターミナル）

実際のクロール等を動かす側。Mac ローカルで動かす。

```bash
cd 02_projects/rakurisu/worker
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# env は 2 通り。どちらでもよい:
#  (A) その場で export
export DATABASE_URL='（web/.env.local と同じ値。& や $ を含むのでシングルクォート）'
#  (B) ファイルに置く（常駐向き・自動で読む）: cp .env.example .env して DATABASE_URL を書く
# 任意: BRAVE_API_KEY=...          （無ければ Stage2=公式サイト特定はスキップ＝法人リストまで）
# 任意: ~/.config/gsheets-mcp/token.json があれば Sheet も生成、無ければ CSV のみ

python3 run_worker.py --once    # queued を 1 件だけ処理して終了（検証向き）
```

常駐運用は `python3 run_worker.py`（poll ループ）。本番の長時間クロールは:
```bash
nohup caffeinate -i python3 run_worker.py > /tmp/rakurisu_worker.log 2>&1 &
```

---

## Step 8. 通貫検証（hotpepper 試走）

1. Web（:3060）で **＋新規ジョブ**
2. 「レシピ」で **hotpepper-beauty-work** を選択、用途 架電営業、目標 40 くらい → **作成して準備**
3. 詳細に「試走 40 件を実行」ボタン → 押す（runs に `queued` が積まれる）
4. Step 7 のワーカーが拾って実行（`--once` なら 1 件処理）
5. Web 画面が **実行中 → 試走取得率 → leads プレビュー** と更新されれば **通貫成功**

---

## 動作確認チェックリスト

- [ ] `pnpm db:push` が通り Neon にテーブルができた
- [ ] `pnpm seed:recipes` で hotpepper レシピが入った
- [ ] `/login` から Google ログインでき、`/`（コンソール）が開く
- [ ] 新規ジョブ作成 → 試走実行で runs に `queued` が立つ
- [ ] ワーカー起動でジョブが `running` → 段階進捗が画面に出る
- [ ] leads プレビュー（会社名・電話）が表示される
- [ ] （Brave キーあれば）電話取得率が出る／（gsheets token あれば）Sheet URL が出る

---

## よくある詰まり

| 症状 | 原因 / 対処 |
|---|---|
| ログイン後 `403 このメールアドレスは…` | `ALLOW_DOMAIN` とログインした Google アカウントのドメインが不一致 |
| `redirect_uri_mismatch` | GCP の Authorized redirect URI と `GOOGLE_REDIRECT_URI` が不一致（末尾スラッシュ・ポート・http/https を完全一致に） |
| `SESSION_SECRET must be at least 32 characters` | 鍵が短い。`openssl rand -hex 32` の 64 文字を入れる |
| ログイン画面から進めない / Cookie 効かない | `.env.local` の値に `$` が入りシングルクォート未使用 → dotenv が展開。`'…'` で囲む |
| `pnpm db:push` が接続エラー | `DATABASE_URL` 末尾 `?sslmode=require` 抜け／Pooled でない接続文字列 |
| ワーカーが `DATABASE_URL is required` | worker 側ターミナルで `export DATABASE_URL=...` を忘れている |
| ワーカーが `skill scripts not found` | `.claude/skills/lead-harvest/scripts` が見つからない。`export LEADHARVEST_SKILL_DIR=/絶対/パス` で指定 |
| 実行中のまま進まない | ワーカーが起動していない（別ターミナルで `run_worker.py`）。ログは `/tmp/rakurisu_worker.log` |
| 電話が全部空 | Brave キー未設定で Stage2 スキップ＝公式サイト未特定→電話も取れない。`BRAVE_API_KEY` を入れる |

---

## 任意キー（無くても動く）

- **BRAVE_API_KEY**: 公式サイト特定（Stage2）に使う。無ければ法人リストまで。skill の SETUP と同じ枠を流用可。
- **Google Sheets トークン** `~/.config/gsheets-mcp/token.json`: あれば納品 Sheet を自動生成。無ければ CSV のみ（画面に CSV パス表示）。

---

## メモ

- ポートは **3060**（AlphaDrive 系の次番）。
- `.env.local` は gitignore 済み（コミットされない）。`.env.local.example` がテンプレ。
- Vercel に載せる時は **web だけ**。ワーカーは Mac 常駐のまま Neon を共有。redirect URI に本番ドメインを追加する。
- 現況・設計の正: `status.md` / `docs/DESIGN.md` / `docs/spec.md`。
