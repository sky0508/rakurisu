# ラクリス ワーカー

Neon の `runs` を poll し、`.claude/skills/lead-harvest/scripts/*` を subprocess 実行して
進捗・リードを DB に書き戻す。Web（Next）とは DB テーブルだけで疎結合。

## セットアップ（Mac ローカル）

```bash
cd 02_projects/rakurisu/worker
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

export DATABASE_URL='postgres://...neon...?sslmode=require'   # web/.env.local と同じ
# 任意: export BRAVE_API_KEY=...    （無ければ Stage2 はスキップ＝法人リストのみ）
# 任意: ~/.config/gsheets-mcp/token.json があれば Sheet も生成、無ければ CSV のみ
```

## 実行

```bash
python3 run_worker.py            # 常駐 poll（本番運用）
python3 run_worker.py --once     # queued を 1 件だけ処理して終了（検証向き）
python3 run_worker.py --run-id <uuid>   # 特定 run を強制実行（デバッグ）
```

本番の長時間クロールは `caffeinate` 推奨:

```bash
nohup caffeinate -i python3 run_worker.py > /tmp/rakurisu_worker.log 2>&1 &
```

## パス上書き（env）

- `LEADHARVEST_SKILL_DIR` — skill の場所（既定: work-os の `.claude/skills/lead-harvest`）
- `LEADHARVEST_WORKER_DATA` — 中間ファイル置き場（既定: `worker/data/`）
- `LEADHARVEST_POLL_SEC` — poll 間隔秒（既定 3）
