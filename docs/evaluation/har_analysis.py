"""
HAR Analysis Utility

Usage:
  python har_analysis.py --har "../HARS/test doc. analysis results.HAR" \
                         --filter "/api/v1/evidence" \
                         --out results.json --md results.md

Computes per-endpoint and overall metrics:
- count, success rate, mean/median/p95/p99 duration
- time breakdown (DNS, connect, SSL, send, wait, receive when available)
- status code distribution and error samples
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
from collections import defaultdict, Counter
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def load_har(path: Path) -> Dict[str, Any]:
    """Load HAR robustly, handling BOM and minor encoding quirks."""
    # Try utf-8-sig first to strip potential BOM
    try:
        with path.open("r", encoding="utf-8-sig", errors="strict") as f:
            text = f.read()
    except Exception:
        # Fallback to permissive read
        with path.open("r", encoding="utf-8", errors="ignore") as f:
            text = f.read()

    # Strip non-printable leading/trailing chars that can break JSON decode
    text = text.lstrip("\ufeff\n\r\t ").rstrip()
    return json.loads(text)


def parse_entry(entry: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    try:
        req = entry.get("request", {})
        res = entry.get("response", {})
        timings = entry.get("timings", {})
        started = entry.get("startedDateTime")
        total_time = entry.get("time")
        url = req.get("url", "")
        method = req.get("method", "")
        status = res.get("status", 0)

        return {
            "url": url,
            "method": method,
            "status": status,
            "time_ms": float(total_time) if total_time is not None else math.nan,
            "timings": {
                k: float(v) for k, v in timings.items() if isinstance(v, (int, float))
            },
            "started": started,
        }
    except Exception:
        return None


def pct(values: List[float], p: float) -> float:
    if not values:
        return math.nan
    values_sorted = sorted(values)
    k = (len(values_sorted) - 1) * (p / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return values_sorted[int(k)]
    d0 = values_sorted[int(f)] * (c - k)
    d1 = values_sorted[int(c)] * (k - f)
    return d0 + d1


def summarize(entries: List[Dict[str, Any]]) -> Dict[str, Any]:
    durations = [e["time_ms"] for e in entries if not math.isnan(e["time_ms"])]
    status_counts = Counter(e["status"] for e in entries)
    success = sum(1 for e in entries if 200 <= e["status"] < 400)
    errors = [e for e in entries if e["status"] >= 400]

    # Aggregate timing breakdowns when provided
    timing_keys = [
        "blocked",
        "dns",
        "connect",
        "ssl",
        "send",
        "wait",
        "receive",
    ]
    timing_sums = defaultdict(float)
    timing_counts = defaultdict(int)
    for e in entries:
        t = e.get("timings", {})
        for k in timing_keys:
            v = t.get(k)
            if isinstance(v, (int, float)) and v >= 0:
                timing_sums[k] += float(v)
                timing_counts[k] += 1

    timing_avgs = {
        k: (timing_sums[k] / timing_counts[k]) if timing_counts[k] else math.nan
        for k in timing_keys
    }

    return {
        "count": len(entries),
        "success_rate": (success / len(entries) * 100.0) if entries else 0.0,
        "mean_ms": statistics.fmean(durations) if durations else math.nan,
        "median_ms": statistics.median(durations) if durations else math.nan,
        "p95_ms": pct(durations, 95) if durations else math.nan,
        "p99_ms": pct(durations, 99) if durations else math.nan,
        "status_distribution": dict(status_counts),
        "timing_avgs_ms": timing_avgs,
        "sample_errors": errors[:5],
    }


def group_by_endpoint(entries: List[Dict[str, Any]], filter_substr: Optional[str]) -> Dict[str, List[Dict[str, Any]]]:
    groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for e in entries:
        url = e["url"]
        if filter_substr and filter_substr not in url:
            continue
        # Extract path without query
        path = url.split("?")[0]
        groups[path].append(e)
    return groups


def to_markdown(overall: Dict[str, Any], per_endpoint: List[Tuple[str, Dict[str, Any]]]) -> str:
    lines: List[str] = []
    lines.append("### HAR Summary")
    lines.append("")
    lines.append(f"- Total requests: {overall['count']}")
    lines.append(f"- Success rate: {overall['success_rate']:.2f}%")
    lines.append(f"- Mean: {overall['mean_ms']:.2f} ms, Median: {overall['median_ms']:.2f} ms, P95: {overall['p95_ms']:.2f} ms, P99: {overall['p99_ms']:.2f} ms")
    lines.append("")
    lines.append("### Per-endpoint Metrics")
    lines.append("")
    lines.append("| Endpoint | Count | Success % | Mean (ms) | P95 (ms) | P99 (ms) | 2xx | 4xx | 5xx |")
    lines.append("|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    for path, stats in per_endpoint:
        dist = stats.get("status_distribution", {})
        c2 = sum(v for k, v in dist.items() if 200 <= int(k) < 300)
        c4 = sum(v for k, v in dist.items() if 400 <= int(k) < 500)
        c5 = sum(v for k, v in dist.items() if 500 <= int(k) < 600)
        lines.append(
            f"| {path} | {stats['count']} | {stats['success_rate']:.1f} | {stats['mean_ms']:.1f} | {stats['p95_ms']:.1f} | {stats['p99_ms']:.1f} | {c2} | {c4} | {c5} |"
        )
    lines.append("")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Analyze HAR file and compute performance metrics")
    parser.add_argument("--har", required=True, help="Path to HAR file")
    parser.add_argument("--filter", default=None, help="Substring filter for URLs (e.g., /api/v1/evidence)")
    parser.add_argument("--out", default=None, help="Write JSON summary to this path")
    parser.add_argument("--md", default=None, help="Write Markdown summary to this path")

    args = parser.parse_args()
    har_path = Path(args.har)
    data = load_har(har_path)

    raw_entries = data.get("log", {}).get("entries", [])
    entries = [e for e in (parse_entry(x) for x in raw_entries) if e]

    overall = summarize(entries)
    groups = group_by_endpoint(entries, args.filter)
    per_endpoint = sorted(
        ((path, summarize(es)) for path, es in groups.items()),
        key=lambda x: x[0]
    )

    result = {
        "overall": overall,
        "per_endpoint": [
            {"endpoint": path, **stats} for path, stats in per_endpoint
        ],
    }

    if args.out:
        Path(args.out).write_text(json.dumps(result, indent=2), encoding="utf-8")
    else:
        print(json.dumps(result, indent=2))

    if args.md:
        Path(args.md).write_text(to_markdown(overall, per_endpoint), encoding="utf-8")


if __name__ == "__main__":
    main()


