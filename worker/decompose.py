"""ラクリス AI 与件分解モジュール（Gemini 2.5 Flash）。

対話版 lead-harvest では Claude Code（サブスク定額）が担っていた「頭脳」を、
ヘッドレスな worker から使えるよう Gemini API で外付けする。

3 コール構成:
  ① decompose_brief  与件 → 構造化ターゲット + パターン判定(A/B/C/D) + 既存レシピマッチ
  ② select_source    パターン A/B → 構造化ソース選定(sitemap / url_pattern / sample_page)
  ③ generate_recipe  サンプル HTML → 抽出レシピ(fields 正規表現 / filter / tier)
生成レシピは sample_page に対して自己検証（company が非 null か）してから採用する。

Gemini は REST を requests で直叩き（worker の依存を psycopg + requests のまま維持）。
HTML fetch / 抽出ロジックは lead-harvest skill（lib.py / crawl.py）を流用する。
"""
import json
import os
import re
import sys
import time
from pathlib import Path

import requests

# ── lead-harvest skill scripts を import path に追加して流用 ──────
_REPO_ROOT = Path(__file__).resolve().parents[3]
_SKILL_DIR = Path(
    os.environ.get("LEADHARVEST_SKILL_DIR", _REPO_ROOT / ".claude/skills/lead-harvest")
)
_SCRIPTS = _SKILL_DIR / "scripts"
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
import lib  # noqa: E402  (fetch / strip_tags)
import crawl  # noqa: E402  (extract_fields / parse_sitemap_urls を自己検証に流用)
import find_sites  # noqa: E402  (brave_key / brave_search を再利用してソース発見をグラウンディング)

# ── 設定 ────────────────────────────────────────────────
API_KEY_ENV = "GEMINI_API_KEY"
DEFAULT_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
FALLBACK_MODEL = "gemini-2.5-flash-lite"  # 無料枠 RPD 429 時のフォールバック
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
HTML_PROMPT_LIMIT = 40000  # サンプル HTML をプロンプトに載せる最大文字数


class DecomposeError(Exception):
    """与件分解の失敗（worker 側で events に出して job を error にする）。"""


# ── Gemini 呼び出し ─────────────────────────────────────
def _api_key() -> str:
    key = os.environ.get(API_KEY_ENV)
    if not key:
        raise DecomposeError(f"{API_KEY_ENV} が未設定です（worker/.env に追記してください）")
    return key


def _gemini_json(prompt: str, *, temperature: float = 0.2, model: str | None = None) -> dict:
    """Gemini を JSON モードで呼び、パース済み dict を返す。
    429 は flash-lite にフォールバック。ネットワーク例外（timeout/接続断）は最大 2 回リトライ。"""
    key = _api_key()
    model = model or DEFAULT_MODEL
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": temperature,
        },
    }
    last_exc = None
    for attempt in range(2):
        try:
            resp = requests.post(
                ENDPOINT.format(model=model), params={"key": key}, json=body, timeout=45
            )
            break
        except (requests.Timeout, requests.ConnectionError) as e:
            last_exc = e
            if attempt < 1:
                time.sleep(2)
    else:
        raise DecomposeError(f"Gemini {model} 通信に失敗（timeout/接続断）: {last_exc}")

    if resp.status_code == 429 and model != FALLBACK_MODEL:
        time.sleep(2)
        return _gemini_json(prompt, temperature=temperature, model=FALLBACK_MODEL)
    if resp.status_code != 200:
        raise DecomposeError(f"Gemini {model} HTTP {resp.status_code}: {resp.text[:200]}")
    data = resp.json()
    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        raise DecomposeError(f"Gemini 応答が不正: {json.dumps(data)[:200]}") from e
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise DecomposeError(f"Gemini JSON parse 失敗: {text[:200]}") from e


# ── ① 与件分解 + パターン判定 ───────────────────────────
def decompose_brief(brief: str, title: str, use_case: str, recipes_catalog: list) -> dict:
    catalog = "\n".join(
        f"- {r['source']}: {r.get('label') or ''}" for r in recipes_catalog
    ) or "(なし)"
    prompt = f"""あなたは B2B リード収集の与件分解を行う専門家です。
以下の与件を分解し、収集ターゲットとアプローチのパターンを判定してください。

# 与件
タイトル: {title}
用途: {use_case}
本文: {brief}

# 既存レシピ（構造化ソース定義）カタログ
{catalog}

# パターン定義
- A: 単一の構造化ソース（sitemap を持つ求人/ポータル/名簿サイト）から機械抽出できる
- B: 複数の構造化ソース（協会名簿等）を名寄せして集める
- C: 集約ソースで母集団を作り、1 社ずつ Web リサーチで補完（per-company・高コスト）
- D: 地域/軸で並列 Web リサーチ（per-company・高コスト）

# 出力（JSON のみ）
{{
  "target": "収集対象の一言要約",
  "region": "地域（全国 or 特定地域）",
  "signals": ["絞り込みシグナル", "..."],
  "pattern": "A" または "B" または "C" または "D",
  "reason": "判定理由（1-2 文）",
  "use_existing_recipe": "カタログの source 名（合致する既存レシピがあれば）。無ければ null",
  "search_queries": ["対象企業が 1 社 1 ページで一覧化されているポータル/名簿サイトを見つけるための日本語検索クエリを 2-3 個", "..."]
}}
"""
    return _gemini_json(prompt)


# ── ② 構造化ソース発見（Brave 検索でグラウンディング）──
def _origin_of(url: str) -> str:
    from urllib.parse import urlsplit

    p = urlsplit(url)
    if not p.scheme or not p.netloc:
        return ""
    return f"{p.scheme}://{p.netloc}"


def discover_candidates(decomp: dict, title: str, log, *, max_origins: int = 8) -> list:
    """Gemini の検索クエリ → Brave 検索（実在 URL）→ 各候補ドメインの sitemap を探索。
    sitemap（leaf）を持つ候補を最大 max_origins 件返す。良し悪しの判定は呼び出し側
    （企業ページ数ゲート + 複数ページ検証）で行う。

    Gemini にサイト名や URL を名指しさせない（幻覚回避）。実在するものは Brave と
    worker の sitemap 探索だけで掴む。戻り値: [{site_name, origin, leaves}, ...]
    """
    key = find_sites.brave_key()
    if not key:
        raise DecomposeError("BRAVE_API_KEY が未設定です（worker/.env に追記してください）")

    queries = [q for q in (decomp.get("search_queries") or []) if q]
    if not queries:
        queries = [f"{decomp.get('target') or title} 一覧 企業 サイト"]

    tried = set()
    candidates = []
    for q in queries:
        if len(candidates) >= max_origins:
            break
        log("decompose", f"Brave 検索: 「{q}」")
        status, results = find_sites.brave_search(key, q)
        if status != 200:
            log("decompose", f"Brave HTTP {status}（このクエリはスキップ）")
            continue
        for r in results:
            if len(candidates) >= max_origins:
                break
            origin = _origin_of(r.get("url", ""))
            if not origin or origin in tried:
                continue
            tried.add(origin)
            leaves = discover_company_pages(origin)
            if leaves:
                candidates.append({"site_name": r.get("title") or origin, "origin": origin, "leaves": leaves})
    return candidates


# ── ②' sitemap 自動発見 + url_pattern 推論 ──────────────
def discover_company_pages(homepage: str, *, max_fetch: int = 15, max_leaves: int = 25) -> list:
    """robots.txt と定番パスから sitemap を辿り、(leaf_sitemap_url, [page_loc,...]) を返す。
    sitemap index は 1 段展開する。crawl.py は leaf sitemap（企業ページを直接列挙）前提なので
    index ではなく leaf を集める。"""
    from urllib.parse import urlsplit

    parts = urlsplit(homepage if "://" in homepage else "https://" + homepage)
    origin = f"{parts.scheme or 'https'}://{parts.netloc}"

    candidates = []
    robots = lib.fetch(origin + "/robots.txt")
    for line in robots.splitlines():
        if line.lower().startswith("sitemap:"):
            candidates.append(line.split(":", 1)[1].strip())
    candidates += [origin + p for p in ("/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml")]

    seen = set()
    leaves = []
    queue = list(dict.fromkeys(candidates))
    fetched = 0
    while queue and fetched < max_fetch and len(leaves) < max_leaves:
        sm = queue.pop(0)
        if sm in seen:
            continue
        seen.add(sm)
        xml = lib.fetch(sm)
        fetched += 1
        if not xml or "<loc>" not in xml:
            continue
        locs = [u.strip() for u in re.findall(r"<loc>\s*(.*?)\s*</loc>", xml, re.S)]
        if "<sitemap" in xml.lower():  # sitemap index → 子 sitemap を展開
            for u in locs:
                if u not in seen:
                    queue.append(u)
        else:  # leaf sitemap（ページ URL を列挙）
            leaves.append((sm, locs))
    return leaves


def infer_url_pattern(sample_urls: list, decomp: dict) -> dict:
    """実在する URL 一覧から、企業詳細ページの url_pattern を Gemini に推論させる。"""
    lst = "\n".join(sample_urls[:60])
    prompt = f"""次は実在するサイトの sitemap から取得した URL 一覧です。
この中から「1 社 1 ページの企業 / 事業者の詳細ページ」に該当する URL の共通パターンを
Python 正規表現で表してください（re.match で判定・^https で始まる・エスケープ済み）。

# ターゲット
{json.dumps(decomp, ensure_ascii=False)}

# 実在 URL 一覧
{lst}

# 出力（JSON のみ）
{{
  "url_pattern": "企業詳細ページ URL にマッチする Python 正規表現",
  "sample_page_url": "上記一覧の中で企業詳細ページに該当する実 URL を 1 件"
}}
注意: sample_page_url は必ず上記の一覧に含まれる URL をそのまま使うこと。
"""
    return _gemini_json(prompt)


# ── ③ 抽出レシピ生成 ───────────────────────────────────
def _clean_html_for_prompt(html: str, limit: int = HTML_PROMPT_LIMIT) -> str:
    """script/style/コメントを除去し空白を畳んで truncate（タグ構造は残す）。"""
    html = re.sub(r"<script.*?</script>", " ", html, flags=re.S | re.I)
    html = re.sub(r"<style.*?</style>", " ", html, flags=re.S | re.I)
    html = re.sub(r"<!--.*?-->", " ", html, flags=re.S)
    html = re.sub(r"[ \t\r\n]+", " ", html)
    return html[:limit]


def generate_recipe(sample_html: str, decomp: dict, src: dict, feedback: str = "") -> dict:
    cleaned = _clean_html_for_prompt(sample_html)
    fb = f"\n# 前回の失敗\n{feedback}\n" if feedback else ""
    prompt = f"""次の企業ページ HTML から会社情報を抽出する「正規表現レシピ」を作ってください。
正規表現は Python の re（re.S 有効）で HTML の生文字列に適用されます。
各 field はキャプチャグループ () で対象値を 1 つだけ取り出す形にします。

# ターゲット / シグナル
{json.dumps(decomp, ensure_ascii=False)}
{fb}
# 企業ページ HTML（先頭のみ・script/style 除去済み）
{cleaned}

# 出力（JSON のみ）
{{
  "fields": {{
    "company": "社名を取る Python 正規表現（キャプチャグループ 1 つ・必須）",
    "address": "所在地の正規表現 または null",
    "shops": "店舗数の数字を取る正規表現 または null",
    "business": "事業内容の正規表現 または null"
  }},
  "filter": {{ "shops_min": 数値（不要なら省略） }},
  "tier": {{ "field": "shops", "buckets": [[20, "S"], [10, "A"], [5, "B"], [3, "C"]] }}
}}
注意:
- company は必ず上記 HTML 中の実データにマッチさせること。
- JSON 文字列内のバックスラッシュは正しくエスケープする（\\\\d など）。
- 値が取れない field は null にする（推測で正規表現を作らない）。
"""
    return _gemini_json(prompt, temperature=0.1)


# ── レシピ組み立て + 自己検証 ───────────────────────────
def _assemble_recipe(gen: dict, src: dict, decomp: dict) -> dict:
    raw_fields = gen.get("fields") or {}
    fields = {k: v for k, v in raw_fields.items() if v and v != "null"}
    if "company" not in fields:
        raise DecomposeError("生成レシピに company field がありません")
    label = f"{src.get('site_name') or 'AI 生成'} — {decomp.get('target') or ''}".strip(" —")
    recipe = {
        "source": None,  # run_worker 側で付与
        "label": label,
        "sitemap": src["sitemap"],
        "url_pattern": src["url_pattern"],
        "delay_sec": 1.5,
        "fields": fields,
    }
    if gen.get("filter"):
        recipe["filter"] = gen["filter"]
    if gen.get("tier"):
        recipe["tier"] = gen["tier"]
    return recipe


def _validate_recipe(recipe: dict, sample_html: str) -> tuple[bool, str]:
    """生成レシピを sample_html に適用し company が取れるか確認する。"""
    try:
        row = crawl.extract_fields(sample_html, recipe)
    except re.error as e:
        return False, f"正規表現エラー: {e}"
    except Exception as e:  # noqa: BLE001
        return False, f"抽出エラー: {e}"
    company = row.get("company")
    if not company:
        return False, "company が null（正規表現が実データにマッチしていない）"
    return True, str(company)[:40]


# ── 候補ソース 1 件を評価してレシピ化を試みる ───────────
MIN_ENTITY_PAGES = 40  # url_pattern にマッチする企業ページがこれ未満なら「ディレクトリでない」と判定


def _try_candidate(cand: dict, decomp: dict, log):
    """候補ソース 1 件から url_pattern 推論 → 企業ページ数ゲート → レシピ生成 →
    単一/複数ページ検証まで通す。成功なら (recipe, src_meta)、不採用なら (None, 理由文字列)。"""
    origin = cand["origin"]
    leaves = cand["leaves"]

    sample_locs = []
    for _, locs in leaves:
        sample_locs.extend(locs[:15])
    sample_locs = sample_locs[:60]
    if not sample_locs:
        return None, "URL 無し"

    try:
        pat = infer_url_pattern(sample_locs, decomp)
    except DecomposeError as e:
        return None, f"pattern 推論失敗: {e}"
    url_pattern = pat.get("url_pattern")
    if not url_pattern:
        return None, "url_pattern 空"
    try:
        rx = re.compile(url_pattern)
    except re.error as e:
        return None, f"url_pattern 不正: {e}"

    # 全 leaf で企業ページ数を数える（ゲート）
    per_leaf = []
    total_matched = 0
    for sm, locs in leaves:
        matched = [u for u in locs if rx.match(u)]
        per_leaf.append((sm, matched))
        total_matched += len(matched)
    if total_matched < MIN_ENTITY_PAGES:
        return None, f"企業ページ {total_matched} 件のみ（<{MIN_ENTITY_PAGES}）→ ディレクトリでない可能性"
    best_sm, best_matches = max(per_leaf, key=lambda x: len(x[1]))
    if not best_matches:
        return None, "採用 sitemap にマッチ無し"

    # sample page（実在する URL を使う）
    sample_url = pat.get("sample_page_url")
    if not sample_url or not rx.match(sample_url):
        sample_url = best_matches[0]
    sample_html = lib.fetch(sample_url)
    if len(sample_html) < 500:
        for u in best_matches[1:4]:
            sample_html = lib.fetch(u)
            if len(sample_html) >= 500:
                sample_url = u
                break
    if len(sample_html) < 500:
        return None, "サンプルページ取得不可"

    src_meta = {
        "site_name": cand["site_name"], "origin": origin, "sitemap": best_sm,
        "url_pattern": url_pattern, "sample_page_url": sample_url,
    }

    # レシピ生成 + 単一ページ自己検証（最大 2 回）
    recipe = None
    last_err = ""
    feedback = ""
    for attempt in range(2):
        log("decompose", f"[{origin}] 抽出レシピ生成中（試行 {attempt + 1}）…")
        gen = generate_recipe(sample_html, decomp, src_meta, feedback)
        candidate = _assemble_recipe(gen, src_meta, decomp)
        ok, detail = _validate_recipe(candidate, sample_html)
        if ok:
            recipe = candidate
            break
        last_err = detail
        feedback = f"前回 company を抽出できず（{detail}）。正規表現を見直すこと。"
    if recipe is None:
        return None, f"レシピ自己検証 失敗: {last_err}"

    # 複数ページ検証（別ページで別会社が取れるか＝ディレクトリか記事かの判別）
    companies = set()
    checked = 0
    for u in best_matches[:6]:
        html = sample_html if u == sample_url else lib.fetch(u)
        if len(html) < 500:
            continue
        try:
            c = (crawl.extract_fields(html, recipe).get("company") or "").strip()
        except Exception:  # noqa: BLE001
            c = ""
        if c:
            companies.add(c)
        checked += 1
        if len(companies) >= 2:
            break
        if u != sample_url:
            time.sleep(0.5)
    if checked >= 1 and len(companies) < 2:
        return None, f"複数ページで同一会社（{next(iter(companies), '?')}）→ ディレクトリでない"

    log("decompose", f"採用: {origin}（企業ページ {total_matched} 件 / 別会社 {len(companies)}+ 確認）")
    return recipe, src_meta


# ── オーケストレーション ────────────────────────────────
def run_decompose(*, brief: str, title: str, use_case: str, recipes_catalog: list, log) -> dict:
    """与件分解のフル実行。log(stage, message) で進捗を events に流す。

    戻り値の kind:
      - "existing"    既存レシピにマッチ  → {recipe_source, pattern}
      - "generated"   新規レシピを生成    → {recipe, pattern, source_meta}
      - "unsupported" C/D で本フェーズ対象外 → {pattern, message}
    """
    log("decompose", "与件分解中（Gemini）…")
    decomp = decompose_brief(brief, title, use_case, recipes_catalog)
    pattern = (decomp.get("pattern") or "").upper()
    log("decompose", f"パターン判定: {pattern or '?'} — {decomp.get('reason', '')}")

    # 既存レシピにマッチ
    existing = decomp.get("use_existing_recipe")
    if existing and any(r["source"] == existing for r in recipes_catalog):
        log("decompose", f"既存レシピにマッチ: {existing}")
        return {"kind": "existing", "recipe_source": existing, "pattern": pattern or "A", "decomp": decomp}

    # C/D は本フェーズ対象外
    if pattern in ("C", "D"):
        msg = f"パターン {pattern}（1 社ずつの Web リサーチ）は現フェーズ未対応です。手動レシピが必要です。"
        return {"kind": "unsupported", "pattern": pattern, "decomp": decomp, "message": msg}

    # A/B → Brave で候補ソースを列挙し、実用的な企業ディレクトリを 1 つ選ぶ
    log("decompose", "構造化ソースを Brave 検索で発見中…")
    candidates = discover_candidates(decomp, title, log)
    if not candidates:
        raise DecomposeError("Brave 検索から sitemap を持つソースを発見できませんでした")

    reasons = []
    for cand in candidates[:5]:
        recipe, meta_or_reason = _try_candidate(cand, decomp, log)
        if recipe:
            return {
                "kind": "generated", "recipe": recipe, "pattern": pattern or "A",
                "decomp": decomp, "source_meta": meta_or_reason,
            }
        reasons.append(f"{cand['origin']}: {meta_or_reason}")
        log("decompose", f"候補スキップ {cand['origin']} — {meta_or_reason}")

    raise DecomposeError(
        "実用的な企業ディレクトリを自動発見できませんでした。"
        "手動レシピ or 別の与件表現が必要です。詳細: " + " / ".join(reasons[:5])
    )
