#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_PATH="${1:-}"

python3 - "$SCRIPT_DIR" "$PWD" "$OUTPUT_PATH" <<'PY'
from __future__ import annotations

import pathlib
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple


script_dir = pathlib.Path(sys.argv[1]).resolve()
cwd_dir = pathlib.Path(sys.argv[2]).resolve()
output_arg = sys.argv[3].strip()


def find_async_service_root() -> pathlib.Path:
    required = ("include", "task", "node_types.hpp")

    def is_root(candidate: pathlib.Path) -> bool:
        return candidate.joinpath(*required).exists()

    seeds = [script_dir, cwd_dir]
    seen: set[pathlib.Path] = set()

    for seed in seeds:
        current = seed
        while True:
            if current not in seen:
                seen.add(current)
                if is_root(current):
                    return current
                if current.exists() and current.is_dir():
                    for child in current.iterdir():
                        if child.is_dir() and child.name.startswith("async") and is_root(child):
                            return child
            if current.parent == current:
                break
            current = current.parent

    raise SystemExit(
        "Unable to locate async-service root. Set ASYNC_SERVICE_ROOT or run from a directory that can reach it."
    )


root = pathlib.Path(os.environ["ASYNC_SERVICE_ROOT"]).resolve() if os.environ.get("ASYNC_SERVICE_ROOT") else find_async_service_root()
include_dir = root / "include"
node_types_path = include_dir / "task" / "node_types.hpp"


def strip_comments(text: str) -> str:
    out: List[str] = []
    i = 0
    state = "code"
    quote = ""
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if state == "code":
            if ch in {'"', "'"}:
                state = "string"
                quote = ch
                out.append(ch)
            elif ch == "/" and nxt == "/":
                state = "line_comment"
                i += 1
            elif ch == "/" and nxt == "*":
                state = "block_comment"
                i += 1
            else:
                out.append(ch)
        elif state == "string":
            out.append(ch)
            if ch == "\\" and i + 1 < len(text):
                out.append(text[i + 1])
                i += 1
            elif ch == quote:
                state = "code"
        elif state == "line_comment":
            if ch == "\n":
                out.append(ch)
                state = "code"
        elif state == "block_comment":
            if ch == "*" and nxt == "/":
                state = "code"
                i += 1
        i += 1
    return "".join(out)


def find_matching(text: str, open_index: int, open_char: str = "{", close_char: str = "}") -> int:
    depth = 0
    state = "code"
    quote = ""
    i = open_index
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if state == "code":
            if ch in {'"', "'"}:
                state = "string"
                quote = ch
            elif ch == open_char:
                depth += 1
            elif ch == close_char:
                depth -= 1
                if depth == 0:
                    return i
        elif state == "string":
            if ch == "\\" and i + 1 < len(text):
                i += 1
            elif ch == quote:
                state = "code"
        i += 1
    raise ValueError(f"Unmatched {open_char} at index {open_index}")


def split_top_level(text: str) -> List[str]:
    parts: List[str] = []
    buf: List[str] = []
    depth_angle = 0
    depth_paren = 0
    depth_brace = 0
    depth_bracket = 0
    state = "code"
    quote = ""
    i = 0
    while i < len(text):
        ch = text[i]
        if state == "code":
            if ch in {'"', "'"}:
                state = "string"
                quote = ch
                buf.append(ch)
            elif ch == "," and depth_angle == depth_paren == depth_brace == depth_bracket == 0:
                parts.append("".join(buf).strip())
                buf = []
            else:
                if ch == "<":
                    depth_angle += 1
                elif ch == ">" and depth_angle > 0:
                    depth_angle -= 1
                elif ch == "(":
                    depth_paren += 1
                elif ch == ")" and depth_paren > 0:
                    depth_paren -= 1
                elif ch == "{":
                    depth_brace += 1
                elif ch == "}" and depth_brace > 0:
                    depth_brace -= 1
                elif ch == "[":
                    depth_bracket += 1
                elif ch == "]" and depth_bracket > 0:
                    depth_bracket -= 1
                buf.append(ch)
        elif state == "string":
            buf.append(ch)
            if ch == "\\" and i + 1 < len(text):
                buf.append(text[i + 1])
                i += 1
            elif ch == quote:
                state = "code"
        i += 1
    if buf or text.strip():
        parts.append("".join(buf).strip())
    return [part for part in parts if part]


def unquote(token: str) -> str:
    token = token.strip()
    if not token:
        return token
    for prefix in ("u8", "u", "U", "L"):
        if token.startswith(prefix) and len(token) > len(prefix) and token[len(prefix)] in {'"', "'"}:
            token = token[len(prefix):]
            break
    if token.startswith('R"'):
        start = token.find("(")
        end = token.rfind(")")
        if start != -1 and end != -1 and end > start:
            return token[start + 1 : end]
    if len(token) >= 2 and token[0] == token[-1] and token[0] in {'"', "'"}:
        body = token[1:-1]
        return bytes(body, "utf-8").decode("unicode_escape")
    return token


def normalize_type(type_text: str) -> str:
    type_text = re.sub(r"\s+", " ", type_text.strip())
    type_text = type_text.replace("std::__cxx11::", "std::")
    type_text = re.sub(
        r"std::basic_string<\s*char\s*,\s*std::char_traits<\s*char\s*>\s*,\s*std::allocator<\s*char\s*>\s*>",
        "std::string",
        type_text,
    )
    type_text = re.sub(
        r"std::vector<\s*std::string\s*,\s*std::allocator<\s*std::string\s*>\s*>",
        "std::vector<std::string>",
        type_text,
    )
    type_text = type_text.replace(" >", ">").replace("< ", "<").replace(" ,", ",")
    type_text = type_text.replace("> >", ">>")
    return type_text


def escape_xml(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def read_first_line(path: pathlib.Path) -> Optional[str]:
    try:
        for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            value = line.strip()
            if value:
                return value
    except Exception:
        return None
    return None


def run_git(args: List[str]) -> Optional[str]:
    try:
        result = subprocess.run(
            ["git", "-C", str(root), *args],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )
    except Exception:
        return None
    if result.returncode != 0:
        return None
    value = result.stdout.strip()
    return value or None


def infer_project_from_tag(tag: str) -> Optional[str]:
    match = re.search(r"\+([A-Za-z0-9_-]+)(?:[-_.][A-Za-z0-9_-]+)?$", tag)
    return match.group(1) if match else None


def sanitize_output_tag(tag: str) -> str:
    return re.sub(r"[^A-Za-z0-9._+-]+", "_", tag).strip("._") or "unknown"


def resolve_version_metadata() -> Dict[str, str]:
    tag = (
        os.environ.get("SBT_ATLAS_TAG")
        or os.environ.get("ATLAS_TAG")
        or os.environ.get("SBT_TAG")
        or run_git(["describe", "--tags", "--always", "--dirty"])
        or read_first_line(root / "version")
    )
    metadata: Dict[str, str] = {}
    if tag:
        metadata["atlas_tag"] = tag
    return metadata


SPECIAL_OUTPUT_DEFAULTS = {
    "errorMsg": "{errorMsg}",
    "out_error_id": "{out_error_id}",
    "out_error_level": "{out_error_level}",
    "out_error_name": "{out_error_name}",
    "out_error_details": "{out_error_details}",
}


def extract_template_name(raw: str) -> str:
    raw = raw.strip()
    if "::" in raw:
        raw = raw.split("::")[-1]
    if "<" in raw:
        raw = raw.split("<", 1)[0]
    return raw.strip()


def extract_base_name(base_raw: Optional[str]) -> Optional[str]:
    if not base_raw:
        return None
    base_raw = base_raw.strip()
    if not base_raw:
        return None
    base_raw = re.sub(r"\b(public|protected|private)\b", "", base_raw).strip()
    base_raw = base_raw.split(",")[0].strip()
    if "<" in base_raw:
        base_raw = base_raw.split("<", 1)[0]
    if "::" in base_raw:
        base_raw = base_raw.split("::")[-1]
    return base_raw.strip() or None


@dataclass
class PortInfo:
    tag: str
    name: str
    type_text: str
    default: Optional[str] = None
    description: Optional[str] = None


@dataclass
class ClassInfo:
    name: str
    file_path: pathlib.Path
    base_name: Optional[str]
    category: str
    ports: List[PortInfo]


class_pattern = re.compile(r"(?m)^[ \t]*class\s+([A-Za-z_]\w*)\b(?:\s*:\s*([^{};]+?))?\s*\{", re.S)
provided_ports_pattern = re.compile(r"static\s+BT::PortsList\s+providedPorts\s*\(\s*\)\s*\{", re.S)
port_pattern = re.compile(r"BT::([A-Za-z_]\w*Port)\s*<", re.S)


def discover_classes() -> Dict[str, Tuple[pathlib.Path, str, Optional[str], int, int]]:
    mapping: Dict[str, Tuple[pathlib.Path, str, Optional[str], int, int]] = {}
    for path in include_dir.rglob("*"):
        if path.suffix.lower() not in {".h", ".hpp", ".hh", ".hxx"}:
            continue
        try:
            text = strip_comments(path.read_text(encoding="utf-8", errors="ignore"))
        except Exception:
            continue
        for match in class_pattern.finditer(text):
            class_name = match.group(1)
            if class_name in mapping:
                continue
            base_name = extract_base_name(match.group(2))
            mapping[class_name] = (path, text, base_name, match.start(), match.end() - 1)
    return mapping


def parse_ports_from_function(function_text: str) -> List[PortInfo]:
    ports: List[PortInfo] = []
    index = 0
    while True:
        match = port_pattern.search(function_text, index)
        if not match:
            break
        port_kind = match.group(1)
        template_start = function_text.find("<", match.end() - 1)
        if template_start == -1:
            index = match.end()
            continue
        template_end = find_matching(function_text, template_start, "<", ">")
        type_text = normalize_type(function_text[template_start + 1 : template_end])
        call_start = function_text.find("(", template_end)
        if call_start == -1:
            index = template_end + 1
            continue
        call_end = find_matching(function_text, call_start, "(", ")")
        args = split_top_level(function_text[call_start + 1 : call_end])
        if not args:
            index = call_end + 1
            continue
        name = unquote(args[0])
        default = unquote(args[1]) if len(args) >= 2 else None
        description = unquote(args[2]) if len(args) >= 3 else None
        tag = {
            "InputPort": "input_port",
            "OutputPort": "output_port",
            "BidirectionalPort": "inout_port",
            "InOutPort": "inout_port",
            "ParamPort": "param_port",
        }.get(port_kind, "input_port")
        ports.append(
            PortInfo(
                tag=tag,
                name=name,
                type_text=type_text,
                default=default,
                description=description,
            )
        )
        index = call_end + 1
    return ports


def locate_provided_ports_body(text: str, class_open_index: int, class_close_index: int) -> List[PortInfo]:
    class_body = text[class_open_index + 1 : class_close_index]
    match = provided_ports_pattern.search(class_body)
    if not match:
        return []
    function_open = class_open_index + 1 + match.end() - 1
    function_close = find_matching(text, function_open, "{", "}")
    function_text = text[function_open + 1 : function_close]
    return parse_ports_from_function(function_text)


ACTION_BASES = {
    "ActionNodeBase",
    "SyncActionNode",
    "StatefulActionNode",
    "ThreadedAction",
    "CoroActionNode",
    "AsyncActionNode",
}
CONDITION_BASES = {"ConditionNode", "SimpleConditionNode"}
CONTROL_BASES = {"ControlNode"}
DECORATOR_BASES = {"DecoratorNode"}


def category_from_base(base_name: Optional[str]) -> Optional[str]:
    if base_name in ACTION_BASES:
        return "Action"
    if base_name in CONDITION_BASES:
        return "Condition"
    if base_name in CONTROL_BASES:
        return "Control"
    if base_name in DECORATOR_BASES:
        return "Decorator"
    return None


def classify_category(file_path: pathlib.Path, class_name: str, base_name: Optional[str], base_category: Optional[str]) -> str:
    direct_category = category_from_base(base_name)
    if direct_category:
        return direct_category
    if base_category:
        return base_category
    path = file_path.as_posix()
    if "/action/" in path or "/service/" in path:
        return "Action"
    if class_name.endswith("Condition"):
        return "Condition"
    return "Action"


class_map = discover_classes()
resolved: Dict[str, ClassInfo] = {}
visiting: set[str] = set()


def resolve_class(name: str) -> ClassInfo:
    if name in resolved:
        return resolved[name]
    if name in visiting:
        raise RuntimeError(f"Recursive inheritance detected while resolving {name}")
    visiting.add(name)
    try:
        entry = class_map.get(name)
        if entry is None:
            info = ClassInfo(name=name, file_path=pathlib.Path("<unknown>"), base_name=None, category="Action", ports=[])
            resolved[name] = info
            return info
        file_path, text, base_name, class_open_index, class_open_brace = entry
        class_close_index = find_matching(text, class_open_brace, "{", "}")
        ports = locate_provided_ports_body(text, class_open_brace, class_close_index)
        base_info = resolve_class(base_name) if base_name and base_name != name and base_name in class_map else None
        if not ports and base_info:
            ports = base_info.ports
        category = classify_category(file_path, name, base_name, base_info.category if base_info else None)
        info = ClassInfo(
            name=name,
            file_path=file_path,
            base_name=base_name,
            category=category,
            ports=ports,
        )
        resolved[name] = info
        return info
    finally:
        visiting.remove(name)


if not node_types_path.exists():
    raise SystemExit(f"Missing node registry: {node_types_path}")

node_types_source = strip_comments(node_types_path.read_text(encoding="utf-8", errors="ignore"))
registration_pattern = re.compile(
    r"factory\.registerNodeType\s*<\s*([^>]+?)\s*>\s*\(\s*(?:\"([^\"]+)\")?\s*\)",
    re.S,
)

registrations: List[Tuple[str, str]] = []
for match in registration_pattern.finditer(node_types_source):
    class_name = extract_template_name(match.group(1))
    node_id = match.group(2) or class_name
    registrations.append((class_name, node_id))

if not registrations:
    raise SystemExit("No registered nodes were found in include/task/node_types.hpp")

lines: List[str] = []
version_metadata = resolve_version_metadata()
atlas_tag = version_metadata.get("atlas_tag") or "unknown"
output_path = (
    pathlib.Path(output_arg).expanduser().resolve()
    if output_arg
    else script_dir / f"tnm_{sanitize_output_tag(atlas_tag)}.btt"
)
metadata_attrs = " ".join(
    f'{key}="{escape_xml(value)}"'
    for key, value in sorted(version_metadata.items())
    if value
)
lines.append(f'<TreeNodesModel{f" {metadata_attrs}" if metadata_attrs else ""}>')
for class_name, node_id in registrations:
    info = resolve_class(class_name)
    lines.append(f'  <{info.category} ID="{escape_xml(node_id)}">')
    for port in info.ports:
        attrs = [
            f'name="{escape_xml(port.name)}"',
        ]
        special_default = SPECIAL_OUTPUT_DEFAULTS.get(port.name) if port.tag == "output_port" else None
        if special_default is not None:
            attrs.append(f'default="{escape_xml(special_default)}"')
        elif port.default is not None and port.default != "":
            attrs.append(f'default="{escape_xml(port.default)}"')
        elif port.default == "":
            attrs.append('default=""')
        if port.description:
            attrs.append(f'description="{escape_xml(port.description)}"')
        lines.append(f'    <{port.tag} ' + " ".join(attrs) + ' />')
    lines.append(f'  </{info.category}>')
lines.append('</TreeNodesModel>')

output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

sys.stdout.write(f'Wrote {len(registrations)} node models to {output_path}\n')
subprocess.run(
    [sys.executable, str(script_dir / "update_atlas_from_btt.py"), str(output_path)],
    check=True,
)
PY
