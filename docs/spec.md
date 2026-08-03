# ラクリス 要件定義書（spec）

> ステータス: **MVP 実装済み・通貫検証済み（2026-07-31）**。本書は要件の記録。実装の現況は `status.md` が正。
> 対（つい）: `docs/DESIGN.md`（デザイン言語）・`status.md`（現況）・`plan.md`（当初計画・大半実装済み）・`SETUP.md`/`DEPLOY.md`（運用手順）
> 注: §7 の案 B（Neon 集約）は**実装済み**。認証は現状 Google OAuth + ドメイン限定だが「誰でも閲覧可」に変更予定（§10-2）。

---

## 1. 背景・目的（なぜ作るか）

lead-harvest（B2B リード収集）の**バックエンドは既に成熟**している（`.claude/skills/lead-harvest/`）:
Python パイプライン（母集団収集 → 公式サイト特定 → 電話抽出 → Sheets 出力）+ パターン A/B/C/D + 品質バー運用 + 検証ループ。

しかし現状の運用は **メインの Claude セッションが逐次スクリプトを叩く「対話駆動」**。以下の課題がある:

- **可視性がない**: 実行中ジョブ・GO 待ち・完了が Sora の頭とターミナルログにしか無い
- **状態が散る**: 案件ごとの JSONL・CSV・Sheets・品質バー達成状況がバラバラ
- **ハンドオフ不可**: 他の人（AlphaDrive 社内）が「今どのリストがどこまで進んでいるか」を見られない

**ラクリス = この既存パイプラインを実行・監視・納品確認する webapp。** 対話駆動を「画面駆動」に載せ替え、状態を 1 箇所に集約する。

## 2. システム全体像

```
┌─────────────────────────────┐
│  ラクリス (webapp / フロント)  │  ← 本プロジェクト。現状は単一HTMLモック
│  ジョブ作成・監視・納品確認・与件分解・検証  │
└───────────────┬─────────────┘
                │ 実行指示 / 状態・成果物の読み取り（アーキテクチャは §7 で未決）
┌───────────────┴─────────────┐
│  lead-harvest パイプライン (バックエンド・既存)  │
│  crawl.py → find_sites.py → extract_phones.py → upload_sheet.py │
│  JSONL 逐次保存(再開可) / recipes(JSON) / Sheets・CSV 出力       │
└─────────────────────────────┘
```

- バックエンドは `/lead-harvest` スキルが正。ラクリスはそれを**置き換えず、操作面をかぶせる**。
- Stage 体系（-2 与件分解 / -1 ヒアリング / 0 パターン判定 / 0.5 試走 / 1-3 本番 / 4 出力 / 5 検証）が要件の背骨。

## 3. 対象ユーザー

- **現在**: Sora（オペレーター兼レビュアー）
- **将来**: AlphaDrive 社内（進捗の閲覧・簡単な起票）。ハンドオフ先を見据えるが、権限・マルチユーザーは今はやらない

## 4. スコープ

| フェーズ | 内容 | 状態 |
|---|---|---|
| **P0 モック** | 単一HTMLで UI と情報設計を合意（4 state）。社内共有 | ✅ ほぼ完了（共有 URL 発行が残） |
| **P1 実行監視 MVP** | ジョブの一覧・状態・stage 進捗・納品リンクを実データで表示 | 未着手 |
| **P2 起票・実行トリガー** | 画面から新規ジョブ作成 → 試走 → GO → 本番をキック | 未着手 |
| **P3 検証・分解の取り込み** | 与件分解(仮説3案)・Stage 5 評価を画面に | 未着手 |

**非スコープ（当面やらない）**: 認証・マルチユーザー・権限管理 / バックエンドの再実装 / SNS・ログイン必須サイト対応（lead-harvest の不向きに準拠） / クラウドでの長時間クロール実行。

## 5. 機能要件（Stage → 画面 の対応）

| # | Stage | 画面での要件 | モック対応 |
|---|---|---|---|
| F1 | -1/0 新規ジョブ | 与件（業種 or「売り先未定」）入力 → 用途選択 → **カラム自動提案（必須/推奨）** → 品質バー仮値提示 | ✅ モーダル |
| F2 | -2 与件分解 | 曖昧な与件を**シグナル仮説 3 案**に分解表示・各案で並列試走をキック | ✅ decompose state |
| F3 | 0.5 試走→GO判断 | 試走の件数・公式サイト率・電話取得率 vs 品質バー → GO / ソース変更 / 再判定 | ✅ dryrun state |
| F4 | 1-3 本番監視 | stage 進捗（母集団→サイト→電話→出力）・ライブログ・経過/ETA・一時停止 | ✅ running state |
| F5 | 4 納品確認 | サマリー数値（納品数・電話率・公式サイト率・要確認）・Tier 内訳・Sheets/CSV/_meta リンク・プレビュー表 | ✅ done state |
| F6 | 5 検証評価 | 架電結果の仮説別集計・勝ち仮説の推奨・本番量産への導線 | ⛔ 未（P3） |
| F7 | 横断 | **ジョブキュー**（全ジョブを状態タグ付きで一覧、クリックで詳細） | ✅ 左レール |

品質バーの「段階確定」（仮値 → パターン補正 → 試走実測で確定）を UI が表現できること。

## 6. ジョブ状態モデル

```
decompose ─┐
           ├─→ (パターン判定) ─→ dryrun ─→ running ─→ done
新規(queued)┘                      │           │
                                   └ 再判定/ソース変更に戻る
                                               └ failed（異常終了・要対応）
```

- モック実装済み: `done / running / dryrun / decompose`
- 追加検討: `queued`（作成直後・未実行）/ `failed`（異常終了）
- 状態は**次のアクション**が一目で分かる語彙にする（`feedback_state_naming_iteration` の方針）

## 7. バックエンド連携アーキテクチャ 【確定: 案 B（2026-07-31 Sora）】

**採用 = 案 B（DB 集約 + ローカル実行）。** 理由: **他の人も進捗を見られるように**したい（社内ハンドオフ）＝状態の中央集約が要る。

```
[Sora の Mac]  lead-harvest Python パイプライン
                crawl → find_sites → extract_phones → upload_sheet
                   │ 各 stage 境界で状態を upsert（報告シム経由）
                   ▼
              [Neon (Postgres)]  jobs / job_stages / deliverables …
                   ▲
                   │ 読み取り（サーバー側）
        [ラクリス webapp (Vercel)]  社内が閲覧・起票
```

- **実行はローカル**（クロールは robots/長時間の都合でクラウド化しない = 案 C 不採用）
- **状態は Neon に集約** → Vercel 上の webapp が読む → 社内から閲覧可
- 起票（新規ジョブ作成）は webapp → Neon に書き、ローカルの実行側が pull して走らせる（P2）

### 却下: 案 A（ローカル常駐のみ）
社内閲覧ができないため不採用。ただし「実行はローカル」の部分は B が引き継ぐ。

## 8. 非機能要件

- **UI 品質**: `docs/DESIGN.md`（quiet-product）準拠。`/rich-webapp-design` スキルの「最低ライン」を下回らない
- **コスト**: ローカル運用前提で無料枠内。重い処理は既存 Python に委譲（メイントークンを使わない設計を維持）
- **データ**: モックはサンプルのみ（実在しない社名・実機密なし）。実データ接続は P1 以降
- **再開性**: バックエンドの「JSONL 逐次保存・再開可能」を UI が壊さない（中断ジョブを running のまま表示できる）

## 9. データ・連携点（既存バックエンドの契約）

- 中間成果物: `<案件>/data/{companies,with_sites,with_phones}.jsonl`（stage 境界＝進捗の観測点）
- 設定: `recipes/<source>.json`（パターン A/B のクロール定義）
- 納品: Tier 別 `final.csv` + Google Sheets（仮説モードは結果列 + `_meta.json`）
- ログ: 本番クロールは `/tmp/lh_crawl.log`（ライブログの供給源）

## 10. コスト設計（この spec の背骨・rakurisu 由来）

| ステージ | LLM | コスト特性 |
|---|---|---|
| クロール / 公式サイト特定 / 電話抽出 / Sheets 納品（A/B 本番） | なし（純 Python + Brave/Sheets） | **件数非依存・実質無料** |
| 与件分解・ソース判定・検証評価 | あり | **件数非依存の固定費**（Gemini で数円） |
| C/D 企業別並列リサーチ | あり（8〜12K token/社） | **件数比例**（Gemini Flash で安く） |

→ 「Web アプリで A/B 案件を回す」= ほぼ無料。金がかかるのは C/D の per-company リサーチだけ。**LLM は Gemini 2.5 Flash を既定、質が効く数回だけ Claude に逃がす。**

## 11. 未決・変更予定

1. ~~§7 の実行アーキテクチャ~~ → **確定・実装済み: 案 B（Neon 集約）**（2026-07-31）
2. **【要変更】認証**: 現状 Google OAuth + ドメイン限定（`ALLOW_DOMAIN`）。Sora 方針「**誰でも閲覧できるように**」→ アクセスモデルを変更予定。**ただし leads は実在企業の電話リスト（AlphaDrive 業務データ）。「誰でも」の水準（ログイン無しの完全公開 / Google ログインは要るがドメイン不問 / URL＝鍵）を確定してから実装**（データ露出の判断）
3. ジョブ ⇔ 案件ディレクトリの紐付けキー（案件スラッグ）
4. `queued` / `failed` 状態の扱い（実装済み state: draft/running/dryrun/done/error）

## 12. AI 与件分解（Gemini・2026-08-03 実装）

対話版 lead-harvest の「頭脳」（与件分解・パターン判定・ソース選定・レシピ作成）は Claude Code（Max サブスク＝定額）が担っていた。ラクリスの worker はヘッドレスでサブスクを使えないため、この頭脳を **Gemini 2.5 Flash** で外付けする。**従量課金の Claude API は不採用**（Sora 判断）。

### スコープ
- **本フェーズ = パターン A**（単一構造化ソースからの機械抽出）に限定。与件 → ソース選定 → 抽出レシピ（正規表現）自動生成 → 既存 A/B Python パイプラインで納品まで。
- C/D（per-company の Web リサーチ・件数比例課金の主戦場）は後段スコープ。判定されたら「未対応」明示で停止。

### フロー
1. web: レシピ無しで起票 → `createJob` が `jobs.state='decompose'` + `runs(kind='decompose', status='queued')` を投入（自動）。
2. worker: decompose run を claim → `decompose.run_decompose()`:
   - ① 与件分解 + パターン判定（既存レシピカタログを渡してマッチ判定も同時に）
   - 既存レシピにマッチ → それを採用（ハイブリッドの前段）
   - A/B かつ新規 → ② **Brave 検索でソース発見**（Gemini が検索クエリ、Brave が実在 URL、worker が robots.txt/sitemap を辿って企業ページ URL を収集。Gemini に URL を名指しさせない＝幻覚回避）→ ③ 実 URL 群から url_pattern 推論 → **企業ページ数ゲート（40 件未満はディレクトリでないと判定しスキップ）** → ④ 実 HTML から抽出レシピ生成 → **単一ページ自己検証（company 非 null）＋ 複数ページ検証（別ページで別会社が取れるか＝記事/ブログ排除）**。候補は最大 5 件まで順に試す。
   - recipes に upsert（`source='ai-<code>'`）→ job に紐付け・pattern 更新 → **dryrun を自動投入**
3. dryrun → 既存パイプライン → `state='dryrun'`（GO 待ち）→ Sora が画面で抽出結果を確認して本番 GO。

### 設計判断
- **Gemini と Brave の分担 = 「考えるのは Gemini、実在するものは Brave/worker が掴む」**。ソースの URL を Gemini に名指しさせると幻覚する（検証で SUUMO の sitemap 捏造を確認）。→ Gemini は検索クエリ・url_pattern・抽出正規表現の「推論」だけ、Brave 検索と worker の sitemap 探索で実在 URL を確定する。対話版 lead-harvest が Stage 0 で WebSearch を使うのと同型。
- **偽ソース排除の三段ゲート**: ① 企業ページ数 ≥ 40（比較記事/ブログは少数 → 排除）② url_pattern が実 loc にマッチ ③ 複数ページで別会社が取れる（フッター運営会社を毎回拾う記事サイトを排除）。候補は Brave 上位から最大 5 件試す。
- **確認点 = dryrun ゲートのみ**（分解〜dryrun は無人自走）。人間は生成レシピの実抽出結果を GO 待ち画面で見て判断する。
- **レシピ生成 = ハイブリッド**（既存レシピマッチ優先 → 無ければ Brave 発見 + 生成 + 三段ゲート）。
- **配置 = worker 側（Python・Mac ローカル）**。HTML fetch を同所で行える／API キーを Vercel でなく Mac に置ける（`BRAVE_API_KEY` と同扱い）／既存の疎結合（DB のみで結合）を維持。
- Gemini は REST を `requests` で直叩き（依存を psycopg + requests のまま維持）。timeout 45s + 1 リトライ、429 は `gemini-2.5-flash` → `gemini-2.5-flash-lite` に自動フォールバック。Brave は既存 `find_sites.brave_key/brave_search` を再利用。
- DB マイグレーション不要（`runs.kind` / `jobs.pattern` / `jobs.state` は text・CHECK 無し）。

### 主要ファイル
`worker/decompose.py`（Gemini 3 コール + Brave ソース発見 + sitemap 探索 + 三段ゲート）/ `worker/run_worker.py`（`process_decompose` + dryrun 自動投入 + recipe upsert）/ `web/src/lib/queries.ts`（`createJob` の decompose run 自動投入）/ `web/src/lib/api-types.ts`（`RunDTO.kind` に `decompose`）。

### 検証済み（2026-08-03・実コール）
- 既存レシピ経路: 「美容師求人」→ hotpepper に正しくマッチ。
- 新規ソース経路: 「リフォーム会社」→ Brave 発見で **ホームプロ（homepro.jp・企業ページ 1032 件）を自動採用**。比較記事ブログ（gotta-ride）・小規模 sitemap（tsukunobi 29 件）・自己検証失敗（reform-madoguchi）を三段ゲートで自動排除。
- tsc / py_compile / オフライン unit 緑。
