from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


class Html2DocError(RuntimeError):
    """A user-facing conversion or validation failure."""


@dataclass(frozen=True)
class Finding:
    severity: str
    code: str
    message: str
    details: dict[str, Any] = field(default_factory=dict)

    def json(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class DocumentMetadata:
    title: str
    author: str
    language: str
    page_width_pt: float
    page_height_pt: float
    margin_pt: float
    body_font: str
    body_size_pt: float


@dataclass
class BuildState:
    source: Path
    warnings: list[Finding] = field(default_factory=list)
    image_count: int = 0
    table_count: int = 0
    hyperlink_count: int = 0
    heading_count: int = 0
    footnotes: dict[int, str] = field(default_factory=dict)
    endnotes: dict[int, str] = field(default_factory=dict)
    bookmark_ids: dict[str, int] = field(default_factory=dict)
    body_section_created: bool = False
    toc_inserted: bool = False
