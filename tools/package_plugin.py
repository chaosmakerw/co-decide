"""Validate and build the skills-only plugin; Python standard library only."""

from __future__ import annotations

import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parents[1]
PAYLOAD = (
    "plugin.json",
    ".codex-plugin/plugin.json",
    "assets/icon.svg",
    "skills/co-decide/SKILL.md",
    "skills/co-decide/agents/openai.yaml",
    "skills/co-decide/references/frontend-design/guide.md",
    "skills/co-decide/references/frontend-design/LICENSE.txt",
    "skills/co-decide/references/frontend-design/SOURCE.md",
    "skills/co-decide/references/interface-craft/layout-theme.md",
    "skills/co-decide/references/interface-craft/design-production.md",
    "skills/co-decide/references/interface-craft/polish.md",
    "skills/co-decide/references/interface-craft/interaction-motion.md",
    "skills/co-decide/references/interface-craft/advanced-motion.md",
    "skills/co-decide/references/interface-craft/SOURCE.md",
    "skills/co-decide/references/interface-craft/LICENSE-impeccable.txt",
    "skills/co-decide/references/interface-craft/NOTICE-impeccable.md",
    "skills/co-decide/references/interface-craft/LICENSE-emil.txt",
    "skills/co-decide/references/interface-craft/LICENSE-gsap.txt",
    "README.md",
    "LICENSE",
)


def build() -> dict:
    checks = 0

    def require(condition: bool, message: str) -> None:
        nonlocal checks
        checks += 1
        if not condition:
            raise ValueError(message)

    portable = json.loads((ROOT / "plugin.json").read_text(encoding="utf-8"))
    compat = json.loads((ROOT / ".codex-plugin/plugin.json").read_text(encoding="utf-8"))
    require(portable["$schema"] == "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", "Unexpected portable schema")
    require(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", portable["name"]) is not None, "Invalid plugin name")
    require(re.fullmatch(r"\d+\.\d+\.\d+", portable["version"]) is not None, "Invalid version")
    for field in ("name", "version", "description", "author"):
        require(portable[field] == compat[field], f"Manifest mismatch: {field}")
    require(compat["skills"] == "./skills/", "Skill path must resolve from plugin root")
    require("skills" not in portable, "Portable skills are discovered from the root skills directory")
    require(not ({"mcpServers", "apps", "hooks"} & compat.keys()), "Unexpected runtime integration")
    ui = portable["extensions"]["com.openai"]["interface"]
    require(ui == compat["interface"], "OpenAI interfaces must match")
    for field, limit in (("displayName", 30), ("shortDescription", 30), ("longDescription", 4000), ("developerName", 80)):
        require(isinstance(ui[field], str) and 0 < len(ui[field]) <= limit, f"Invalid interface field: {field}")
    require(ui["capabilities"] == [], "Skills-only package has no app capabilities")
    for field in ("composerIcon", "logo"):
        icon = (ROOT / ui[field]).resolve()
        require(ui[field].startswith("./") and icon.is_relative_to(ROOT) and icon.is_file(), f"Invalid icon path: {field}")
    svg = ET.parse(ROOT / "assets/icon.svg").getroot()
    require(svg.tag == "{http://www.w3.org/2000/svg}svg" and svg.get("viewBox") == "0 0 64 64", "Expected square SVG")
    skill_path = ROOT / "skills/co-decide/SKILL.md"
    skill = skill_path.read_text(encoding="utf-8")
    require(skill.startswith("---\n") and "\n---\n" in skill, "Missing skill frontmatter")
    require(re.search(r"^name: co-decide$", skill.split("\n---\n", 1)[0], re.MULTILINE) is not None, "Skill identity mismatch")
    require(len(list((ROOT / "skills").rglob("SKILL.md"))) == 1, "Expected exactly one skill, including references")
    marketplace = json.loads((ROOT / ".agents/plugins/marketplace.json").read_text(encoding="utf-8"))
    require(marketplace["name"] == "co-decide", "Unexpected marketplace identity")
    entries = [entry for entry in marketplace["plugins"] if entry["name"] == portable["name"]]
    require(len(entries) == 1, "Expected one matching marketplace entry")
    entry = entries[0]
    require(entry["source"]["source"] == "local" and entry["source"]["path"].startswith("./"), "Expected relative local source")
    require((ROOT / entry["source"]["path"]).resolve() == ROOT, "Marketplace points at another source")
    require(entry["policy"] == {"installation": "AVAILABLE", "authentication": "ON_INSTALL"}, "Unexpected marketplace policy")
    require(entry["category"] == "Productivity", "Unexpected marketplace category")
    contents = {}
    require(len(set(PAYLOAD)) == len(PAYLOAD), "Duplicate payload path")
    for relative in PAYLOAD:
        path = ROOT / relative
        require(path.resolve().is_relative_to(ROOT) and path.is_file(), f"Missing or escaping payload: {relative}")
        contents[relative] = path.read_bytes()
        require(bool(contents[relative]), f"Empty payload: {relative}")
    for relative, data in contents.items():
        if not relative.startswith("skills/co-decide/") or not relative.endswith(".md"):
            continue
        for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", data.decode("utf-8")):
            if re.match(r"[a-zA-Z][a-zA-Z0-9+.-]*:", target) or target.startswith("#"):
                continue
            resolved = ((ROOT / relative).parent / target.split("#", 1)[0]).resolve()
            require(resolved.is_relative_to(ROOT) and resolved.relative_to(ROOT).as_posix() in contents,
                    f"Reference missing from package: {relative} -> {target}")
    output = ROOT / "dist" / f"{portable['name']}-{portable['version']}.zip"
    output.parent.mkdir(exist_ok=True)
    with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for relative, data in sorted(contents.items()):
            info = ZipInfo(relative, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data, compresslevel=9)
    with ZipFile(output) as archive:
        require(set(archive.namelist()) == set(PAYLOAD), "Unexpected ZIP contents")
        require(archive.testzip() is None, "ZIP CRC failure")
        for relative, data in contents.items():
            require(archive.read(relative) == data, f"ZIP content mismatch: {relative}")
    return {
        "Tests run": checks,
        "Passed": checks,
        "Failures": 0,
        "Errors": 0,
        "Skipped": 0,
        "build": "BUILD SUCCESS",
        "archive": str(output),
        "archive_bytes": output.stat().st_size,
        "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "payload_files": len(PAYLOAD),
        "skill_characters": len(skill),
        "skill_utf8_bytes": len(skill.encode("utf-8")),
    }


if __name__ == "__main__":
    try:
        print(json.dumps(build(), ensure_ascii=False, indent=2))
    except (ValueError, KeyError, OSError, ET.ParseError) as error:
        print(f"BUILD FAILURE: {error}", file=sys.stderr)
        sys.exit(1)
