#!/usr/bin/env python3
"""Convert TreeNodesModel XML into a review candidate without touching the atlas."""

from __future__ import annotations

import argparse
import json
import pathlib
import xml.etree.ElementTree as ET
from typing import Any, Dict


PORT_ROLES = {
    "input_port": "input",
    "output_port": "output",
    "inout_port": "inout",
    "param_port": "param",
}


def parse_tree_nodes_model(path: pathlib.Path) -> tuple[str, Dict[str, Dict[str, Any]]]:
    root = ET.parse(path).getroot()
    if root.tag != "TreeNodesModel":
        raise SystemExit(f"{path} is not a TreeNodesModel file")

    atlas_tag = root.attrib.get("atlas_tag") or root.attrib.get("tag") or "unknown"
    nodes: Dict[str, Dict[str, Any]] = {}
    for node_element in root:
        node_id = node_element.attrib.get("ID") or node_element.attrib.get("id")
        if not node_id:
            continue
        params: Dict[str, Dict[str, Any]] = {}
        for port in node_element:
            role = PORT_ROLES.get(port.tag)
            name = port.attrib.get("name")
            if not role or not name:
                continue
            param: Dict[str, Any] = {
                "role": role,
                "type": port.attrib.get("type") or "unknown",
                "required": port.attrib.get("required") == "true",
                "description": port.attrib.get("description") or "",
            }
            if "default" in port.attrib:
                param["default"] = port.attrib["default"]
            params[name] = param
        nodes[node_id] = {
            "category": node_element.tag,
            "params": params,
        }
    return atlas_tag, nodes


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert TreeNodesModel .btt into an atlas review candidate; never modifies node-library/atlas."
    )
    parser.add_argument("btt", type=pathlib.Path, help="TreeNodesModel .btt file")
    parser.add_argument("--output", type=pathlib.Path, help="Candidate JSON output path")
    args = parser.parse_args()

    tag, nodes = parse_tree_nodes_model(args.btt)
    output_path = args.output or args.btt.with_suffix(".atlas-candidate.json")
    payload = {
        "schemaVersion": 1,
        "atlasTag": tag,
        "nodes": nodes,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote atlas candidate from {args.btt}: {output_path}")
    print("The official node-library/atlas files were not modified; review the TNM in Atlas Editor.")


if __name__ == "__main__":
    main()
