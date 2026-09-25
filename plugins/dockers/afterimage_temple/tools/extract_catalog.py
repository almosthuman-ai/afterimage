"""Freeze Glitch Temple 0.47.3 control metadata for the native dock.

Run manually against the read-only source checkout. The resulting JSON is shipped
with Afterimage; no TypeScript runtime or mutable source checkout is required.
"""
import json
import re
import sys
from pathlib import Path


def balanced(source, start, opening="{", closing="}"):
    depth = 0
    quote = None
    escaped = False
    for index in range(start, len(source)):
        char = source[index]
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
        elif char in ("'", '"', "`"):
            quote = char
        elif char == opening:
            depth += 1
        elif char == closing:
            depth -= 1
            if depth == 0:
                return source[start:index + 1]
    raise ValueError("Unbalanced Temple source")


def fields(block):
    result = {}
    for name in ("id", "type", "name", "label", "category", "description"):
        match = re.search(rf'\b{name}:\s*["\']([^"\']*)["\']', block)
        if match:
            result[name] = match.group(1)
    for name in ("min", "max", "step", "default"):
        match = re.search(rf'\b{name}:\s*(-?(?:\d+(?:\.\d*)?|\.\d+))', block)
        if match:
            result[name] = float(match.group(1))
    choices = re.search(r'\bchoices:\s*\[([^\]]*)\]', block)
    if choices:
        result["choices"] = re.findall(r'["\']([^"\']*)["\']', choices.group(1))
    return result


def objects_in(source):
    index = 0
    while True:
        start = source.find("{", index)
        if start < 0:
            break
        block = balanced(source, start)
        yield block
        index = start + len(block)


def main():
    source = Path(sys.argv[1]).read_text(encoding="utf-8")
    output = Path(sys.argv[2])
    effect_start = source.index("export const effectDefinitions:")
    effect_array = source.index("[", source.index("=", effect_start))
    effect_text = balanced(source, effect_array, "[", "]")
    effects = []
    for block in objects_in(effect_text):
        header = fields(block[:block.index("parameters:")]) if "parameters:" in block else {}
        if "type" not in header:
            continue
        params_start = block.index("parameters:")
        params_array = block.index("[", params_start)
        params_text = balanced(block, params_array, "[", "]")
        header["parameters"] = [value for entry in objects_in(params_text) if (value := fields(entry)).get("id")]
        effects.append(header)
    form_start = source.index("export const koneFormParameters:")
    form_end = source.index("export const anatomyParameterIds", form_start)
    forms = [value for entry in objects_in(source[form_start:form_end]) if (value := fields(entry)).get("id")]
    if len(effects) < 31 or len(forms) < 30:
        raise ValueError(f"Unexpected source catalog: {len(effects)} effects and {len(forms)} form controls")
    palette_source = Path(sys.argv[3]).read_text(encoding="utf-8")
    palette_section = palette_source.split("const families:", 1)[1].split("export const builtInPalettes", 1)[0]
    palettes = []
    family = ""
    for line in palette_section.splitlines():
        heading = re.match(r'\s*(?:"([^"]+)"|([A-Za-z]+)):\s*\[', line)
        if heading:
            family = heading.group(1) or heading.group(2)
        for name, hexes in re.findall(r'\[\s*["\']([^"\']+)["\']\s*,\s*["\']([0-9a-fA-F ]+)["\']\s*\]', line):
            colors = [int(value, 16) for value in hexes.split()]
            if len(colors) == 4:
                palettes.append({"name": name, "family": family, "colors": colors})
    if len(palettes) != 51:
        raise ValueError(f"Expected 51 original palettes, found {len(palettes)}")
    output.write_text(json.dumps({"sourceVersion": "0.47.3", "effects": effects, "formParameters": forms, "palettes": palettes}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
