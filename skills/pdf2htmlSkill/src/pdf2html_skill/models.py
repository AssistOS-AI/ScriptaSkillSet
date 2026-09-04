from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class PdfProfile:
    path: Path
    sha256: str
    pages: int
    title: str | None
    author: str | None
    page_sizes: list[tuple[float, float]]
    page_text: list[str]

    @property
    def text(self) -> str:
        return "\n\f\n".join(self.page_text)


@dataclass(frozen=True)
class TypographyProfile:
    body_size_pt: float = 11.0
    body_family: str = "sans-serif"
    text_color: str = "#111827"
    heading_scale: tuple[float, float, float] = (2.0, 1.55, 1.25)
    body_font_name: str = ""


@dataclass(frozen=True)
class EmbeddedFont:
    source_name: str
    css_family: str
    href: str
    weight: int = 400
    style: str = "normal"


@dataclass(frozen=True)
class SourceWord:
    text: str
    token: str
    bold: bool
    italic: bool
    size_pt: float
    x0: float
    x1: float
    top: float
    bottom: float
    font_family: str = "sans-serif"
    color: str = "#111827"
    font_name: str = ""


@dataclass(frozen=True)
class SourceLine:
    text: str
    size_pt: float
    x0: float = 0.0
    x1: float = 0.0
    top: float = 0.0
    bottom: float = 0.0


@dataclass(frozen=True)
class SourceRectangle:
    x0: float
    x1: float
    top: float
    bottom: float
    fill_color: str


@dataclass(frozen=True)
class SourceStroke:
    x0: float
    x1: float
    top: float
    bottom: float
    color: str
    width: float = 0.5


@dataclass(frozen=True)
class SourceImage:
    x0: float
    x1: float
    top: float
    bottom: float


@dataclass(frozen=True)
class SourceLink:
    word_indexes: tuple[int, ...]
    href: str


@dataclass(frozen=True)
class SourcePageEvidence:
    page_number: int
    width_pt: float
    height_pt: float
    words: tuple[SourceWord, ...]
    lines: tuple[SourceLine, ...]
    links: tuple[SourceLink, ...]
    rectangles: tuple[SourceRectangle, ...] = ()
    strokes: tuple[SourceStroke, ...] = ()
    images: tuple[SourceImage, ...] = ()


@dataclass(frozen=True)
class SourceEvidence:
    typography: TypographyProfile
    pages: tuple[SourcePageEvidence, ...]
    fonts: tuple[EmbeddedFont, ...] = ()


@dataclass
class Finding:
    severity: str
    code: str
    message: str
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class ValidationReport:
    status: str
    metrics: dict[str, Any]
    findings: list[Finding]
    environment: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "metrics": self.metrics,
            "findings": [asdict(item) for item in self.findings],
            "environment": self.environment,
        }
