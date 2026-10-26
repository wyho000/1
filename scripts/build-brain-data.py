#!/usr/bin/env python3
"""Reproduce the compact FlyWire female brain annotation map; Python stdlib only.

This extracts anatomical coordinates and class counts, NOT measured neural
activity or synapse weights. Read docs/data-provenance.md for scope.
"""
from __future__ import annotations

import argparse
from collections import Counter
import csv
import hashlib
import io
import json
from pathlib import Path
import random
from urllib.request import urlopen

REVISION = "327ae7bdcc18c7a6a5ac014a4bfa9c7560fe854e"
SOURCE = (
    "https://raw.githubusercontent.com/flyconnectome/flywire_annotations/"
    + REVISION
    + "/supplemental_files/Supplemental_file1_neuron_annotations.tsv"
)
EXPECTED_SHA256 = "5cbd94da723111ad8512fca3aeb93eeb22dd9682d93995c7f6a23f05f68cb0eb"
GROUPS = [
    ("AL", "후각 감각·더듬이엽 회로", 700),
    ("LH", "측각 회로", 400),
    ("MB", "버섯체 회로", 900),
    ("CX", "중심복합체 회로", 500),
    ("DN", "하행 뉴런", 400),
    ("OTHER", "기타 주석 뉴런", 4100),
]


def group_index(row: dict[str, str]) -> int:
    cell_class = row["cell_class"]
    if cell_class in {"olfactory", "ALPN", "ALLN", "ALIN", "ALON"}:
        return 0
    if cell_class in {"LHLN", "LHCENT"}:
        return 1
    if cell_class in {"Kenyon_Cell", "MBON", "MBIN"}:
        return 2
    if cell_class == "CX":
        return 3
    if row["super_class"] == "descending":
        return 4
    return 5


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-file", type=Path, help="Use an existing full upstream TSV.")
    parser.add_argument(
        "--output", type=Path,
        default=Path(__file__).resolve().parents[1] / "public/data/flywire-brain.json",
    )
    args = parser.parse_args()
    if args.source_file:
        raw = args.source_file.read_bytes()
    else:
        with urlopen(SOURCE, timeout=90) as response:
            raw = response.read()
    actual_hash = hashlib.sha256(raw).hexdigest()
    if actual_hash != EXPECTED_SHA256:
        raise RuntimeError("Upstream checksum mismatch; refusing to generate the map.")
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8")), delimiter="\t"))
    assert len(rows) == 139255, "Unexpected annotation count"
    assert len({row['root_id'] for row in rows}) == len(rows), "Duplicate neuron IDs"

    grouped = [[] for _ in GROUPS]
    for row in rows:
        grouped[group_index(row)].append(row)
    rng = random.Random(783)
    points, point_ids, groups = [], [], []
    for index, (group_id, label, budget) in enumerate(GROUPS):
        population = sorted(grouped[index], key=lambda row: int(row["root_id"]))
        selected = sorted(rng.sample(population, min(len(population), budget)), key=lambda row: int(row["root_id"]))
        groups.append({
            "id": group_id,
            "label": label,
            "count": len(population),
            "sampleCount": len(selected),
            "sideCounts": dict(sorted(Counter(row["side"] or "unknown" for row in population).items())),
        })
        for row in selected:
            points.append([
                round(float(row["pos_x"]) * 0.004, 3),
                round(float(row["pos_y"]) * 0.004, 3),
                round(float(row["pos_z"]) * 0.04, 3),
                index,
                {"left": 0, "right": 1}.get(row["side"], 2),
            ])
            # Keep 64-bit root IDs as strings: JavaScript numbers lose precision.
            point_ids.append(row["root_id"])

    bounds = [
        [round(min(float(row["pos_" + axis]) * scale for row in rows), 3),
         round(max(float(row["pos_" + axis]) * scale for row in rows), 3)]
        for axis, scale in [("x", 0.004), ("y", 0.004), ("z", 0.04)]
    ]
    payload = {
        "metadata": {
            "name": "FlyWire female adult brain: annotation anchor sample",
            "sex": "female",
            "organism": "Drosophila melanogaster",
            "segmentationVersion": "783",
            "annotationVersion": "v2.0.0",
            "sourceCommit": REVISION,
            "sourceUrl": SOURCE,
            "repositoryUrl": "https://github.com/flyconnectome/flywire_annotations/tree/" + REVISION,
            "sourceSha256": actual_hash,
            "sourceBytes": len(raw),
            "totalAnnotatedNeurons": len(rows),
            "sampledNeurons": len(points),
            "sampling": "Deterministic per-class sample; Python Random(783); enriched for sensory and central circuits.",
            "pointMeaning": "Actual neuronal anchor points, not neuron morphologies, neuropil boundaries, or synapses.",
            "groupMeaning": "Broad annotation-derived circuit groups; neurons are not assigned solely by spatial position.",
            "activityMeaning": "Activity colors are outputs of an illustrative sensory/behavioral model, not recorded activity or a reconstructed synaptic simulation.",
            "licenseNote": "The pinned repository has no standalone data license file. Source attribution and publication citations are retained; no CC0 claim is made.",
            "citations": [
                {"authors": "Schlegel et al.", "year": 2024, "title": "Whole-brain annotation and multi-connectome cell typing of Drosophila", "doi": "10.1038/s41586-024-07686-5"},
                {"authors": "Dorkenwald et al.", "year": 2024, "title": "Neuronal wiring diagram of an adult brain", "doi": "10.1038/s41586-024-07558-y"},
            ],
        },
        "projection": {
            "units": "micrometers",
            "axes": ["x", "y", "z"],
            "bounds": bounds,
            "pointLayout": ["x", "y", "z", "groupIndex", "sideIndex"],
            "sideLabels": ["left", "right", "center_or_unknown"],
            "coordinateConversion": "Source anchor voxel coordinates multiplied by [0.004, 0.004, 0.04] micrometers.",
        },
        "groups": groups,
        "classCounts": dict(sorted(Counter(row["cell_class"] or "unclassified" for row in rows).items())),
        "superClassCounts": dict(sorted(Counter(row["super_class"] for row in rows).items())),
        "points": points,
        "pointIds": point_ids,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {len(points):,} real anchor points from {len(rows):,} annotations to {args.output}")
    print(f"Verified source SHA-256: {actual_hash}")


if __name__ == "__main__":
    main()
