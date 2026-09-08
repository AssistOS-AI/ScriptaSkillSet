from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Literal


Profile = Literal["fidelity", "balanced", "compact"]


class Doc2PdfError(RuntimeError):
    """A user-facing conversion, dependency, or validation failure."""


@dataclass(frozen=True)
class Finding:
    severity: Literal["error", "warning"]
    code: str
    message: str
    details: dict[str, Any] = field(default_factory=dict)

    def json(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class RuntimeTools:
    libreoffice: Path | None
    ghostscript: Path | None

    def json(self) -> dict[str, str | None]:
        return {
            "libreOffice": str(self.libreoffice) if self.libreoffice else None,
            "ghostscript": str(self.ghostscript) if self.ghostscript else None,
        }
