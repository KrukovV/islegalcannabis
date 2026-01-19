import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone

KEYWORDS = ["is legal weed", "is legal cannabis", "legal weed"]


def load_iso3166_map(root_dir):
    path = os.path.join(root_dir, "data", "iso3166", "iso3166-1.json")
    with open(path, "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    entries = payload.get("entries", [])
    name_to_alpha2 = {}
    alpha2_to_name = {}
    for entry in entries:
        name = entry.get("name")
        alpha2 = entry.get("alpha2") or entry.get("id")
        if not name or not alpha2:
            continue
        key = normalize_name(name)
        name_to_alpha2[key] = alpha2
        alpha2_to_name[alpha2] = name
    return name_to_alpha2, alpha2_to_name


def normalize_name(value):
    text = value.lower().strip()
    text = text.replace("&", "and")
    text = re.sub(r"[^a-z0-9]+", "", text)
    return text


def map_country_name(country, name_map):
    normalized = normalize_name(country)
    return name_map.get(normalized)




def save_outputs(outdir, entries, meta):
    os.makedirs(outdir, exist_ok=True)
    csv_path = os.path.join(outdir, "top50_5y.csv")
    json_path = os.path.join(outdir, "top50_5y.json")
    try:
        import pandas as pd
    except Exception:
        pd = None
    if pd:
        df = pd.DataFrame(entries)
        df.to_csv(csv_path, index=False)
    else:
        import csv
        fieldnames = [
            "rank",
            "country",
            "country_iso2",
            "score",
            "kw1",
            "kw2",
            "kw3",
            "source"
        ]
        with open(csv_path, "w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            for entry in entries:
                writer.writerow(entry)
    with open(json_path, "w", encoding="utf-8") as handle:
        json.dump({"meta": meta, "rows": entries}, handle, indent=2)


def print_markdown(entries):
    print("| Rank | Country | ISO2 | Score |")
    print("| --- | --- | --- | --- |")
    for entry in entries:
        score = entry.get("score")
        score_text = "" if score is None else f"{score:.2f}"
        print(
            f"| {entry['rank']} | {entry['country']} | "
            f"{entry['country_iso2']} | {score_text} |"
        )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--timeframe", default="today 5-y")
    parser.add_argument("--hl", default="en")
    parser.add_argument("--tz", default="360")
    parser.add_argument("--outdir", default=os.path.join("Reports", "trends"))
    args = parser.parse_args()

    root_dir = os.path.abspath(os.path.join(os.getcwd()))
    outdir = args.outdir
    timeframe = args.timeframe

    try:
        from pytrends.request import TrendReq
    except Exception:
        print("FATAL REAL TRENDS: missing_dep")
        return 1

    def error_reason(err):
        text = str(err).lower()
        if "429" in text or "too many" in text:
            return "429"
        if "blocked" in text or "captcha" in text:
            return "blocked"
        if "timeout" in text or "timed out" in text:
            return "timeout"
        return "error"

    try:
        trends = TrendReq(
            hl=args.hl,
            tz=int(args.tz),
            retries=2,
            backoff_factor=0.2
        )
        trends.build_payload(
            kw_list=KEYWORDS,
            timeframe=timeframe,
            geo=""
        )
        df = trends.interest_by_region(
            resolution="COUNTRY",
            inc_low_vol=True
        )
        if df is None or df.empty:
            print("PENDING REAL TRENDS: empty")
            return 2

        name_map, alpha2_name = load_iso3166_map(root_dir)
        rows = []
        for country, row in df.iterrows():
            iso2 = map_country_name(country, name_map)
            if not iso2:
                continue
            kw_values = [float(row.get(k, 0)) for k in KEYWORDS]
            score = max(kw_values) if kw_values else 0
            rows.append(
                {
                    "country": country,
                    "country_iso2": iso2,
                    "score": score,
                    "kw1": kw_values[0],
                    "kw2": kw_values[1],
                    "kw3": kw_values[2],
                    "source": "pytrends"
                }
            )

        rows.sort(key=lambda item: item["score"], reverse=True)
        rows = rows[:50]
        if len(rows) < 50:
            print("PENDING REAL TRENDS: empty")
            return 2

        entries = []
        for idx, row in enumerate(rows, start=1):
            entries.append(
                {
                    "rank": idx,
                    "country": row["country"],
                    "country_iso2": row["country_iso2"],
                    "score": row["score"],
                    "kw1": row["kw1"],
                    "kw2": row["kw2"],
                    "kw3": row["kw3"],
                    "source": row["source"]
                }
            )

        meta = {
            "source": "pytrends",
            "timeframe": timeframe,
            "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        }
        save_outputs(outdir, entries, meta)
        print_markdown(entries)
        return 0
    except Exception as err:
        reason = error_reason(err)
        if reason in ["429", "blocked", "timeout"]:
            print(f"PENDING REAL TRENDS: {reason}")
            return 2
        print(f"FATAL REAL TRENDS: {reason}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
