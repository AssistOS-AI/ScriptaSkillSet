from __future__ import annotations

from pathlib import Path
import re
from urllib.parse import unquote, urlparse

from bs4 import BeautifulSoup, Tag
import cssselect2
import tinycss2

from .models import Finding, Html2DocError


SUPPORTED = {
    "background", "background-color", "border", "border-bottom", "border-color",
    "border-style", "border-width", "break-before", "color", "font-family",
    "font-size", "font-style", "font-weight", "height", "line-height", "margin",
    "margin-bottom", "margin-left", "margin-right", "margin-top", "page-break-before",
    "padding", "padding-bottom", "padding-left", "padding-right", "padding-top",
    "text-align", "text-decoration", "text-indent", "vertical-align", "width",
}
INHERITED = {"color", "font-family", "font-size", "font-style", "font-weight", "line-height", "text-align"}
LENGTH_RE = re.compile(r"^(-?[0-9.]+)(pt|px|rem|em|in|cm|mm|%)?$", re.I)
VAR_RE = re.compile(r"var\(\s*(--[\w-]+)\s*(?:,\s*(.*))?\)$")


def local_asset(html_path: Path, value: str) -> Path:
    parsed = urlparse(value)
    if parsed.scheme or value.startswith("//"):
        raise Html2DocError(f"Remote resources are not supported: {value}")
    candidate = (html_path.parent / unquote(parsed.path)).resolve()
    if not candidate.is_relative_to(html_path.parent.resolve()):
        raise Html2DocError(f"Resource escapes the Scripta book directory: {value}")
    if not candidate.is_file():
        raise Html2DocError(f"Local resource is missing: {value}")
    return candidate


def _declarations(text: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for item in tinycss2.parse_declaration_list(text, skip_comments=True, skip_whitespace=True):
        if item.type != "declaration":
            continue
        result[item.lower_name] = tinycss2.serialize(item.value).strip()
    for shorthand in ("margin", "padding"):
        if shorthand not in result:
            continue
        parts = result[shorthand].split()
        if 1 <= len(parts) <= 4:
            top, right, bottom, left = (
                (parts[0], parts[0], parts[0], parts[0]) if len(parts) == 1 else
                (parts[0], parts[1], parts[0], parts[1]) if len(parts) == 2 else
                (parts[0], parts[1], parts[2], parts[1]) if len(parts) == 3 else tuple(parts)
            )
            for suffix, value in zip(("top", "right", "bottom", "left"), (top, right, bottom, left)):
                result.setdefault(f"{shorthand}-{suffix}", value)
    if "background" in result and "background-color" not in result:
        candidate = result["background"].split()[0]
        if candidate.startswith("#") or candidate.casefold() in {"black", "white", "red", "blue", "gray", "grey"}:
            result["background-color"] = candidate
    return result


class StyleResolver:
    """Small deterministic cascade for the CSS emitted by the Scripta skills."""

    def __init__(self, soup: BeautifulSoup, html_path: Path):
        self.soup = soup
        self.html_path = html_path
        self._matched: dict[int, dict[str, tuple[tuple[int, int, int], int, str]]] = {}
        self.warnings: list[Finding] = []
        ignored_properties: set[str] = set()
        chunks = [tag.get_text() for tag in soup.find_all("style")]
        for link in soup.find_all("link", href=True):
            rel = [str(value).casefold() for value in link.get("rel", [])]
            if "stylesheet" in rel:
                chunks.append(local_asset(html_path, str(link["href"])).read_text(encoding="utf-8"))
        order = 0
        for chunk in chunks:
            for rule in tinycss2.parse_stylesheet(chunk, skip_comments=True, skip_whitespace=True):
                if rule.type != "qualified-rule":
                    continue
                selector_text = tinycss2.serialize(rule.prelude).strip()
                declarations = _declarations(tinycss2.serialize(rule.content))
                ignored_properties.update(name for name in declarations if not name.startswith("--") and name not in SUPPORTED)
                for selector in selector_text.split(","):
                    selector = selector.strip()
                    try:
                        specificity = cssselect2.compile_selector_list(selector)[0].specificity
                        matches = soup.select(selector)
                    except Exception:
                        self.warnings.append(Finding("warning", "css-selector-unsupported", f"CSS selector was ignored: {selector}"))
                        continue
                    for tag in matches:
                        values = self._matched.setdefault(id(tag), {})
                        for name, value in declarations.items():
                            previous = values.get(name)
                            if previous is None or (specificity, order) >= (previous[0], previous[1]):
                                values[name] = (specificity, order, value)
                    order += 1
        if ignored_properties:
            self.warnings.append(Finding(
                "warning", "css-properties-ignored",
                "Browser-only CSS properties were ignored during Word conversion.",
                {"properties": sorted(ignored_properties)},
            ))
        self._cache: dict[int, dict[str, str]] = {}

    def style(self, tag: Tag) -> dict[str, str]:
        key = id(tag)
        if key in self._cache:
            return self._cache[key]
        values = dict(self._matched.get(key, {}))
        for name, value in _declarations(str(tag.get("style", ""))).items():
            values[name] = ((1000, 0, 0), 10**9, value)
        result = {name: value[2] for name, value in values.items()}
        parent = tag.parent if isinstance(tag.parent, Tag) else None
        inherited = self.style(parent) if parent else {}
        variables = {name: value for name, value in inherited.items() if name.startswith("--")}
        variables.update({name: value for name, value in result.items() if name.startswith("--")})
        for name in INHERITED:
            if name not in result and name in inherited:
                result[name] = inherited[name]
        result.update(variables)
        self._cache[key] = result
        return result

    def resolve(self, tag: Tag, name: str, default: str | None = None) -> str | None:
        style = self.style(tag)
        value = style.get(name, default)
        return self._resolve_vars(value, style) if value else value

    def _resolve_vars(self, value: str, style: dict[str, str]) -> str:
        value = value.strip()
        match = VAR_RE.fullmatch(value)
        if match:
            selected = style.get(match.group(1), match.group(2) or "")
            return self._resolve_vars(selected, style) if selected else ""
        def replace(match: re.Match[str]) -> str:
            selected = style.get(match.group(1), match.group(2) or "")
            return self._resolve_vars(selected, style) if selected else "0"
        previous = None
        while "var(" in value and previous != value:
            previous = value
            value = re.sub(r"var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)", replace, value)
        return value


def points(value: str | None, *, base: float = 11.0, page: float = 612.0) -> float | None:
    if not value:
        return None
    value = value.strip().casefold()
    if value.startswith("calc(") and value.endswith(")"):
        expression = value[5:-1].strip()
        multiplication = re.fullmatch(r"(.+?)\s*\*\s*([0-9.]+)", expression)
        if multiplication:
            left = points(multiplication.group(1), base=base, page=page)
            return left * float(multiplication.group(2)) if left is not None else None
    match = LENGTH_RE.fullmatch(value)
    if not match:
        return None
    number, unit = float(match.group(1)), (match.group(2) or "pt").casefold()
    return {
        "pt": number, "px": number * 0.75, "rem": number * base,
        "em": number * base, "in": number * 72, "cm": number * 72 / 2.54,
        "mm": number * 72 / 25.4, "%": number * page / 100,
    }[unit]


def color_hex(value: str | None) -> str | None:
    if not value:
        return None
    value = value.strip().casefold()
    names = {"black": "000000", "white": "FFFFFF", "red": "FF0000", "blue": "0000FF", "gray": "808080", "grey": "808080"}
    if value in names:
        return names[value]
    if re.fullmatch(r"#[0-9a-f]{6}", value):
        return value[1:].upper()
    if re.fullmatch(r"#[0-9a-f]{3}", value):
        return "".join(character * 2 for character in value[1:]).upper()
    rgb = re.fullmatch(r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,[^)]*)?\)", value)
    if rgb:
        return "".join(f"{min(255, int(part)):02X}" for part in rgb.groups())
    return None
