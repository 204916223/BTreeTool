#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import pathlib
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional, Set, Tuple


PORT_ROLES = {
    "input_port": "input",
    "output_port": "output",
    "inout_port": "inout",
    "param_port": "param",
}


def read_json(path: pathlib.Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path: pathlib.Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def normalize_text(value: Optional[str]) -> str:
    return value if value is not None else ""


def normalize_availability(value: Any, tag: str) -> List[Dict[str, str]]:
    if value == "always":
        return [{"since": tag}]
    if isinstance(value, list) and value:
        result = []
        for item in value:
            if not isinstance(item, dict):
                continue
            normalized = {}
            if item.get("since"):
                normalized["since"] = str(item["since"])
            if item.get("until"):
                normalized["until"] = str(item["until"])
            if normalized:
                result.append(normalized)
        if result:
            return result
    return [{"since": tag}]


def close_availability_if_open(param: Dict[str, Any], tag: str) -> None:
    availability = normalize_availability(param.get("availability"), tag)
    changed = False
    for item in availability:
        if item.get("since") and not item.get("until"):
            item["until"] = tag
            changed = True
    if changed:
        param["availability"] = availability


def parse_tree_nodes_model(path: pathlib.Path) -> Tuple[str, Dict[str, Dict[str, Any]]]:
    root = ET.parse(path).getroot()
    if root.tag != "TreeNodesModel":
        raise SystemExit(f"{path} is not a TreeNodesModel file")
    atlas_tag = root.attrib.get("atlas_tag") or root.attrib.get("tag") or "unknown"
    nodes: Dict[str, Dict[str, Any]] = {}
    for node_element in root:
        category = node_element.tag
        node_id = node_element.attrib.get("ID") or node_element.attrib.get("ID".lower())
        if not node_id:
            continue
        params: Dict[str, Dict[str, Any]] = {}
        for port in node_element:
            role = PORT_ROLES.get(port.tag)
            name = port.attrib.get("name")
            if not role or not name:
                continue
            param: Dict[str, Any] = {
                "availability": [{"since": atlas_tag}],
                "role": role,
                "type": port.attrib.get("type") or "unknown",
                "required": port.attrib.get("required") == "true",
                "description": normalize_text(port.attrib.get("description")),
            }
            if "default" in port.attrib:
                param["default"] = port.attrib["default"]
            params[name] = param
        nodes[node_id] = {
            "category": category,
            "mainline": {
                "params": params,
            },
        }
    return atlas_tag, nodes


def ensure_node_metadata(entry: Dict[str, Any], node_id: str, category: str) -> None:
    entry["category"] = entry.get("category") or category
    entry.setdefault("title", node_id)
    entry.setdefault("description", "")
    entry.setdefault("department", "")
    entry.setdefault("maintainer", "")
    entry.setdefault("source_notes", [])
    entry.setdefault("mainline", {})
    entry.setdefault("custom", {})


def merge_param(existing: Dict[str, Any], incoming: Dict[str, Any], tag: str) -> Dict[str, Any]:
    merged = dict(existing)
    merged["availability"] = normalize_availability(merged.get("availability"), tag)
    merged["role"] = incoming.get("role") or merged.get("role") or "param"
    merged["type"] = merged.get("type") or incoming.get("type") or "unknown"
    merged["required"] = bool(merged.get("required", incoming.get("required", False)))
    if incoming.get("description") and not merged.get("description"):
        merged["description"] = incoming["description"]
    else:
        merged.setdefault("description", "")
    if "default" in incoming:
        merged["default"] = incoming["default"]
    return merged


def merge_node(existing: Dict[str, Any], node_id: str, incoming: Dict[str, Any], tag: str) -> Dict[str, Any]:
    entry = dict(existing)
    ensure_node_metadata(entry, node_id, incoming.get("category") or "Action")

    mainline = dict(entry.get("mainline") or {})
    mainline.setdefault("status", "draft")
    mainline.setdefault("rules", [])
    mainline.setdefault("examples", [])

    existing_params = dict(mainline.get("params") or {})
    incoming_params = incoming.get("mainline", {}).get("params") or {}
    incoming_names: Set[str] = set(incoming_params)
    for name, incoming_param in incoming_params.items():
        existing_params[name] = merge_param(
            existing_params.get(name, {}),
            incoming_param,
            tag,
        )
    for name, existing_param in existing_params.items():
        if name not in incoming_names and isinstance(existing_param, dict):
            close_availability_if_open(existing_param, tag)
    mainline["params"] = existing_params
    entry["mainline"] = mainline
    entry["category"] = incoming.get("category") or entry.get("category") or "Action"
    return entry


def merge_nodes(atlas_nodes: Dict[str, Any], btt_nodes: Dict[str, Dict[str, Any]], tag: str) -> Dict[str, Any]:
    merged = dict(atlas_nodes)
    for node_id, incoming in btt_nodes.items():
        merged[node_id] = merge_node(merged.get(node_id, {}), node_id, incoming, tag)
    return dict(sorted(merged.items(), key=lambda item: item[0].lower()))


def update_manifest(path: pathlib.Path, tag: str) -> None:
    manifest = read_json(path, {})
    manifest.setdefault("schemaVersion", 1)
    manifest.setdefault("atlasVersion", "2026.06")
    manifest["defaultTag"] = tag if tag != "unknown" else manifest.get("defaultTag", "unknown")
    manifest.setdefault(
        "tagFormat",
        {
            "description": "Tag should be sortable. Common format: major.yyMM.patch, e.g. 3.2605.4.",
            "examples": [tag] if tag != "unknown" else [],
        },
    )
    manifest.setdefault("knownProjects", [])
    manifest.setdefault(
        "resolutionPolicy",
        {
            "unknownTag": "fallback_to_default_with_warning",
            "unknownProject": "fallback_to_mainline_with_warning",
            "customExtendsDefault": "mainline",
        },
    )
    write_json(path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description="Merge TreeNodesModel .btt ports into the default node atlas.")
    parser.add_argument("btt", type=pathlib.Path, help="TreeNodesModel .btt file")
    parser.add_argument(
        "--atlas-dir",
        type=pathlib.Path,
        default=pathlib.Path(__file__).resolve().parents[1] / "node-library" / "atlas",
        help="Atlas directory containing manifest.json, nodes.json, and variables.json",
    )
    args = parser.parse_args()

    tag, btt_nodes = parse_tree_nodes_model(args.btt)
    nodes_path = args.atlas_dir / "nodes.json"
    manifest_path = args.atlas_dir / "manifest.json"
    atlas_nodes = read_json(nodes_path, {})
    if not isinstance(atlas_nodes, dict):
        atlas_nodes = {}
    write_json(nodes_path, merge_nodes(atlas_nodes, btt_nodes, tag))
    update_manifest(manifest_path, tag)
    variables_path = args.atlas_dir / "variables.json"
    if not variables_path.exists():
        write_json(variables_path, {})
    print(f"Updated atlas from {args.btt} with tag {tag}: {nodes_path}")


if __name__ == "__main__":
    main()
