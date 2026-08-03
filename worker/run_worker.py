#!/usr/bin/env python3
"""
ラクリス Python ワーカー。

Neon の runs テーブルを poll し status='queued' を claim → 実行 → 書き戻し。
既存 lead-harvest スクリプト（crawl / find_sites / extract_phones / upload_sheet）を
無改変で subprocess 実行し、stdout を parse して run_stages / events / runs / leads を更新する。

Web（Next）とはこの DB テーブルだけで疎結合（HTTP なし）。
BRAVE_API_KEY と ~/.config/gsheets-mcp/token.json はこのプロセス（Mac ローカル）が持つ。

使い方:
  export DATABASE_URL=postgres://...neon...?sslmode=require
  python3 run_worker.py                 # 常駐 poll ループ
  python3 run_worker.py --run-id <uuid> # 単発（デバッグ）
  python3 run_worker.py --once          # queued を 1 件だけ処理して終了

依存: psycopg[binary]  （pip install 'psycopg[binary]'）
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Json


# ── .env 読み込み（依存なしの軽量ローダー） ─────────────────
def _load_dotenv(path: Path):
    """worker/.env があれば読み込む。既に環境にある値は上書きしない。
    値は 'foo' / "foo" のクォートを剥がすだけの素朴な実装。"""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip()
        if (val.startswith("'") and val.endswith("'")) or (
            val.startswith('"') and val.endswith('"')
        ):
            val = val[1:-1]
        os.environ.setdefault(key, val)


_load_dotenv(Path(__file__).resolve().parent / ".env")

# ── 設定 ────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parents[3]  # worker → rakurisu → 02_projects → root
SKILL_DIR = Path(
    os.environ.get("LEADHARVEST_SKILL_DIR", REPO_ROOT / ".claude/skills/lead-harvest")
)
SCRIPTS = SKILL_DIR / "scripts"
DATA_ROOT = Path(os.environ.get("LEADHARVEST_WORKER_DATA", Path(__file__).resolve().parent / "data"))
POLL_SEC = float(os.environ.get("LEADHARVEST_POLL_SEC", "3"))

STAGE_ORDER_DRYRUN = ["crawl", "find_sites", "extract_phones"]
STAGE_ORDER_PROD = ["crawl", "find_sites", "extract_phones", "upload"]


def now():
    return datetime.now(timezone.utc)


# ── DB ヘルパ ───────────────────────────────────────────
def connect():
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is required")
    return psycopg.connect(url, autocommit=True, row_factory=dict_row)


def ensure_stages(conn, run_id, stages):
    with conn.cursor() as cur:
        for st in stages:
            cur.execute(
                """INSERT INTO run_stages (run_id, stage, status)
                   VALUES (%s, %s, 'pending')
                   ON CONFLICT (run_id, stage) DO NOTHING""",
                (run_id, st),
            )


def set_stage(conn, run_id, stage, **fields):
    if not fields:
        return
    cols = ", ".join(f"{k} = %s" for k in fields)
    vals = list(fields.values()) + [run_id, stage]
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE run_stages SET {cols} WHERE run_id = %s AND stage = %s", vals
        )


def add_event(conn, run_id, stage, message):
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO events (run_id, stage, message) VALUES (%s, %s, %s)",
            (run_id, stage, message[:500]),
        )


def set_run(conn, run_id, **fields):
    cols = ", ".join(f"{k} = %s" for k in fields)
    vals = list(fields.values()) + [run_id]
    with conn.cursor() as cur:
        cur.execute(f"UPDATE runs SET {cols} WHERE id = %s", vals)


def set_job_state(conn, job_id, state):
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE jobs SET state = %s, updated_at = now() WHERE id = %s",
            (state, job_id),
        )


# ── stdout パーサ ───────────────────────────────────────
RE_CRAWL_PAGES = re.compile(r"対象ページ:\s*(\d+)")
RE_CRAWL_PROG = re.compile(r"\[(\d+)\]\s*合格\s*(\d+)")
RE_CRAWL_DONE = re.compile(r"DONE:\s*合格\s*(\d+)\s*/\s*走査\s*(\d+)")
RE_IJ = re.compile(r"\[(\d+)/(\d+)\]")
RE_SITES_DONE = re.compile(r"DONE:\s*公式サイト\s*(\d+)/(\d+)")
RE_PHONE_DONE = re.compile(r"DONE:\s*電話\s*(\d+)/(\d+)")
RE_CSV = re.compile(r"CSV:\s*(\d+)\s*行\s*->\s*(.+)")
RE_URL = re.compile(r"URL:\s*(\S+)")


def run_stage_subprocess(conn, run_id, stage, cmd, env):
    """subprocess を起動し stdout を1行ずつ parse して DB を更新。戻り値=最終 count/total/rate。"""
    set_stage(conn, run_id, stage, status="running", started_at=now())
    set_run(conn, run_id, current_stage=stage)
    add_event(conn, run_id, stage, f"$ {' '.join(str(c) for c in cmd)}")

    result = {"count": 0, "total": None, "rate": None, "csv": None, "url": None, "skipped": False}
    proc = subprocess.Popen(
        cmd,
        cwd=str(SKILL_DIR),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    last_push = 0.0
    assert proc.stdout is not None
    for raw in proc.stdout:
        line = raw.rstrip("\n")
        if not line:
            continue
        # パターン別
        if stage == "crawl":
            m = RE_CRAWL_PAGES.search(line)
            if m:
                result["total"] = int(m.group(1))
            m = RE_CRAWL_PROG.search(line)
            if m:
                result["count"] = int(m.group(2))
            m = RE_CRAWL_DONE.search(line)
            if m:
                result["count"] = int(m.group(1))
        elif stage in ("find_sites", "extract_phones"):
            m = RE_IJ.search(line)
            if m:
                i, n = int(m.group(1)), int(m.group(2))
                result["count"], result["total"] = i, n
                result["rate"] = f"{round(i / n * 100)}%" if n else None
            m = RE_SITES_DONE.search(line) or RE_PHONE_DONE.search(line)
            if m:
                f, n = int(m.group(1)), int(m.group(2))
                result["count"], result["total"] = f, n
                result["rate"] = f"{round(f / n * 100)}%" if n else None
            if "Brave キー未設定" in line:
                result["skipped"] = True
        elif stage == "upload":
            m = RE_CSV.search(line)
            if m:
                result["count"] = int(m.group(1))
                result["csv"] = m.group(2).strip()
            m = RE_URL.search(line)
            if m:
                result["url"] = m.group(1).strip()

        # 進捗を throttle して DB へ（イベントは重要行のみ）
        t = time.time()
        if t - last_push > 1.0:
            set_stage(conn, run_id, stage, count=result["count"], total=result["total"], rate=result["rate"])
            last_push = t
        if line.startswith("DONE") or line.startswith("CSV") or line.startswith("URL") or "⚠" in line:
            add_event(conn, run_id, stage, line)

    proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(f"{stage} exited {proc.returncode}")
    set_stage(conn, run_id, stage, count=result["count"], total=result["total"], rate=result["rate"])
    return result


# ── リード取込 ─────────────────────────────────────────
def tier_of(value, buckets):
    if value is None:
        return None
    for threshold, label in buckets:
        if value >= threshold:
            return label
    return None


def verdict_of(row):
    if row.get("phone_flag"):
        return "要確認"
    note = row.get("phone_note") or ""
    if not row.get("phone"):
        return "なし"
    head = note.split(" |")[0].strip()
    return "good" if head == "good" else ("要確認" if head else "good")


def load_leads(conn, run_id, jsonl_path, recipe):
    if not jsonl_path.exists():
        return 0
    tier_conf = (recipe or {}).get("tier", {})
    field = tier_conf.get("field", "shops")
    buckets = tier_conf.get("buckets", [])
    n = 0
    with conn.cursor() as cur, open(jsonl_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            val = row.get(field)
            cur.execute(
                """INSERT INTO leads
                   (run_id, company, tier, address, official_site, phone,
                    phone_note, phone_flag, source_url, shops, brands, business, verdict, raw)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (
                    run_id,
                    row.get("company"),
                    tier_of(val, buckets),
                    row.get("address"),
                    row.get("official_site"),
                    row.get("phone") or None,
                    row.get("phone_note"),
                    row.get("phone_flag") or None,
                    row.get("_url"),
                    row.get("shops"),
                    Json(row.get("brands")) if row.get("brands") is not None else None,
                    row.get("business"),
                    verdict_of(row),
                    Json(row),
                ),
            )
            n += 1
    return n


# ── 1 run の実行 ───────────────────────────────────────
def process_run(conn, run):
    run_id = run["id"]
    job_id = run["job_id"]
    kind = run["kind"]
    limit_n = run["limit_n"]

    # job + recipe を取得
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM jobs WHERE id = %s", (job_id,))
        job = cur.fetchone()
        recipe = None
        if job and job["recipe_id"]:
            cur.execute("SELECT json FROM recipes WHERE id = %s", (job["recipe_id"],))
            rr = cur.fetchone()
            recipe = rr["json"] if rr else None

    if not recipe:
        set_run(conn, run_id, status="error", error="レシピ未設定（A/B パターンのみ対応）", finished_at=now())
        set_job_state(conn, job_id, "error")
        add_event(conn, run_id, None, "レシピが無いため実行できません（Phase 3: 与件分解は未実装）")
        return

    stages = STAGE_ORDER_DRYRUN if kind == "dryrun" else STAGE_ORDER_PROD
    ensure_stages(conn, run_id, STAGE_ORDER_PROD)  # 4 行作る（upload は dryrun で skipped 表示）

    rundir = DATA_ROOT / str(run_id)
    rundir.mkdir(parents=True, exist_ok=True)
    recipe_path = rundir / "recipe.json"
    recipe_path.write_text(json.dumps(recipe, ensure_ascii=False), encoding="utf-8")
    companies = rundir / "companies.jsonl"
    with_sites = rundir / "with_sites.jsonl"
    with_phones = rundir / "with_phones.jsonl"
    final_csv = rundir / "final.csv"

    env = dict(os.environ)
    py = sys.executable or "python3"

    try:
        # Stage 1: crawl
        cmd = [py, str(SCRIPTS / "crawl.py"), "--recipe", str(recipe_path), "--out", str(companies)]
        if limit_n:
            cmd += ["--limit", str(limit_n)]
        run_stage_subprocess(conn, run_id, "crawl", cmd, env)
        set_stage(conn, run_id, "crawl", status="done", finished_at=now())

        # Stage 2: find_sites
        run_stage_subprocess(
            conn, run_id, "find_sites",
            [py, str(SCRIPTS / "find_sites.py"), "--in", str(companies), "--out", str(with_sites)],
            env,
        )
        set_stage(conn, run_id, "find_sites", status="done", finished_at=now())

        # Stage 3: extract_phones
        run_stage_subprocess(
            conn, run_id, "extract_phones",
            [py, str(SCRIPTS / "extract_phones.py"), "--in", str(with_sites), "--out", str(with_phones)],
            env,
        )
        set_stage(conn, run_id, "extract_phones", status="done", finished_at=now())

        # leads 取込（dryrun でもプレビュー用に入れる）
        n = load_leads(conn, run_id, with_phones, recipe)
        add_event(conn, run_id, None, f"leads {n} 件を取込")

        if kind == "dryrun":
            set_stage(conn, run_id, "upload", status="skipped")
            set_run(conn, run_id, status="done", current_stage=None, finished_at=now())
            set_job_state(conn, job_id, "dryrun")  # GO 待ち
            add_event(conn, run_id, None, "試走完了 — GO 判断待ち")
            return

        # Stage 4: upload（本番のみ）
        title = f"{job['title']} {now():%Y-%m-%d}"
        res = run_stage_subprocess(
            conn, run_id, "upload",
            [py, str(SCRIPTS / "upload_sheet.py"), "--in", str(with_phones),
             "--recipe", str(recipe_path), "--title", title, "--csv-out", str(final_csv)],
            env,
        )
        set_stage(conn, run_id, "upload", status="done", finished_at=now())
        set_run(
            conn, run_id, status="done", current_stage=None, finished_at=now(),
            csv_path=res.get("csv") or str(final_csv), sheet_url=res.get("url"),
        )
        set_job_state(conn, job_id, "done")
        add_event(conn, run_id, None, "本番完了 — 納品しました")

    except Exception as e:  # noqa: BLE001
        set_run(conn, run_id, status="error", error=str(e)[:500], current_stage=None, finished_at=now())
        set_job_state(conn, job_id, "error")
        add_event(conn, run_id, None, f"エラー: {e}")


# ── claim ──────────────────────────────────────────────
def claim_one(conn):
    with conn.cursor() as cur:
        cur.execute(
            """UPDATE runs SET status='running', started_at=now()
               WHERE id = (
                 SELECT id FROM runs WHERE status='queued'
                 ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
               )
               RETURNING id, job_id, kind, limit_n"""
        )
        return cur.fetchone()


def fetch_run(conn, run_id):
    with conn.cursor() as cur:
        cur.execute("SELECT id, job_id, kind, limit_n FROM runs WHERE id = %s", (run_id,))
        return cur.fetchone()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-id", help="この run だけ実行（status 無視）")
    ap.add_argument("--once", action="store_true", help="queued を 1 件処理して終了")
    args = ap.parse_args()

    if not SCRIPTS.exists():
        sys.exit(f"skill scripts not found: {SCRIPTS}  (set LEADHARVEST_SKILL_DIR)")

    conn = connect()
    print(f"[worker] skill={SKILL_DIR}  data={DATA_ROOT}")

    if args.run_id:
        run = fetch_run(conn, args.run_id)
        if not run:
            sys.exit("run not found")
        set_run(conn, run["id"], status="running", started_at=now())
        print(f"[worker] processing run {run['id']} ({run['kind']})")
        process_run(conn, run)
        print("[worker] done")
        return

    while True:
        run = claim_one(conn)
        if run:
            print(f"[worker] claimed run {run['id']} ({run['kind']})")
            process_run(conn, run)
            print(f"[worker] finished run {run['id']}")
            if args.once:
                break
        else:
            if args.once:
                print("[worker] no queued runs")
                break
            time.sleep(POLL_SEC)


if __name__ == "__main__":
    main()
