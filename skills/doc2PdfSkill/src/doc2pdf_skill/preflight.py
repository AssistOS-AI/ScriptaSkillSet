from __future__ import annotations

import os
import platform
from pathlib import Path
import shutil
import subprocess
from typing import Sequence

import pymupdf as fitz
import pikepdf
from PIL import __version__ as pillow_version

from .models import Doc2PdfError, RuntimeTools


def _first_executable(candidates: Sequence[str | Path]) -> Path | None:
    for candidate in candidates:
        value = str(candidate)
        found = shutil.which(value)
        if found:
            return Path(found).resolve()
        path = Path(value).expanduser()
        if path.is_file() and os.access(path, os.X_OK):
            return path.resolve()
    return None


def discover_libreoffice() -> Path | None:
    candidates: list[str | Path] = ["soffice", "libreoffice"]
    system = platform.system()
    if system == "Darwin":
        candidates += [
            "/Applications/LibreOffice.app/Contents/MacOS/soffice",
            Path.home() / "Applications/LibreOffice.app/Contents/MacOS/soffice",
        ]
    elif system == "Windows":
        for root in (os.environ.get("PROGRAMFILES"), os.environ.get("PROGRAMFILES(X86)")):
            if root:
                candidates.append(Path(root) / "LibreOffice/program/soffice.exe")
    return _first_executable(candidates)


def discover_ghostscript() -> Path | None:
    candidates: list[str | Path] = ["gs", "gswin64c.exe", "gswin32c.exe"]
    if platform.system() == "Windows":
        for root_name in ("PROGRAMFILES", "PROGRAMFILES(X86)"):
            root = os.environ.get(root_name)
            if root:
                candidates.extend(sorted(Path(root).glob("gs/gs*/bin/gswin*c.exe"), reverse=True))
    return _first_executable(candidates)


def tools() -> RuntimeTools:
    return RuntimeTools(discover_libreoffice(), discover_ghostscript())


def doctor() -> dict[str, object]:
    runtime = tools()
    return {
        "ok": runtime.libreoffice is not None,
        "python": platform.python_version(),
        "platform": platform.system(),
        **runtime.json(),
        "pikepdf": pikepdf.__version__,
        "pymupdf": fitz.version[0],
        "pillow": pillow_version,
        "profiles": {
            "fidelity": runtime.libreoffice is not None,
            "balanced": runtime.libreoffice is not None and runtime.ghostscript is not None,
            "compact": runtime.libreoffice is not None and runtime.ghostscript is not None,
        },
        "remoteServices": False,
    }


def _linux_installer(need_lo: bool, need_gs: bool) -> list[list[str]] | None:
    is_root = hasattr(os, "geteuid") and os.geteuid() == 0
    if is_root:
        privilege: list[str] = []
    elif shutil.which("sudo"):
        privilege = ["sudo"]
    else:
        raise Doc2PdfError("Installing Linux system packages requires root access or sudo.")
    apt_packages = (["libreoffice-writer"] if need_lo else []) + (["ghostscript"] if need_gs else [])
    dnf_packages = (["libreoffice-writer"] if need_lo else []) + (["ghostscript"] if need_gs else [])
    pacman_packages = (["libreoffice-fresh"] if need_lo else []) + (["ghostscript"] if need_gs else [])
    if shutil.which("apt-get"):
        return [
            [*privilege, "apt-get", "update"],
            [*privilege, "apt-get", "install", "-y", *apt_packages],
        ]
    if shutil.which("dnf"):
        return [[*privilege, "dnf", "install", "-y", *dnf_packages]]
    if shutil.which("pacman"):
        return [[*privilege, "pacman", "-S", "--needed", *pacman_packages]]
    return None


def install_commands(runtime: RuntimeTools | None = None) -> list[list[str]]:
    runtime = runtime or tools()
    need_lo, need_gs = runtime.libreoffice is None, runtime.ghostscript is None
    if not need_lo and not need_gs:
        return []
    system = platform.system()
    if system == "Darwin" and shutil.which("brew"):
        commands: list[list[str]] = []
        if need_lo:
            commands.append(["brew", "install", "--cask", "libreoffice"])
        if need_gs:
            commands.append(["brew", "install", "ghostscript"])
        return commands
    if system == "Linux":
        commands = _linux_installer(need_lo, need_gs)
        if commands:
            return commands
    if system == "Windows" and shutil.which("winget"):
        commands = []
        common = ["--exact", "--accept-package-agreements", "--accept-source-agreements"]
        if need_lo:
            commands.append(["winget", "install", "--id", "TheDocumentFoundation.LibreOffice", *common])
        if need_gs:
            commands.append(["winget", "install", "--id", "ArtifexSoftware.GhostScript", *common])
        return commands
    raise Doc2PdfError(
        "No supported package manager was found. Install LibreOffice manually from "
        "https://www.libreoffice.org/download/download-libreoffice/ and Ghostscript "
        "from https://ghostscript.com/releases/gsdnld.html, then run doctor again."
    )


def install_dependencies(*, assume_yes: bool = False) -> dict[str, object]:
    commands = install_commands()
    if not commands:
        return {"status": "already_available", **doctor(), "commands": []}
    rendered = [subprocess.list2cmdline(command) for command in commands]
    if not assume_yes:
        print("The following system commands will be run:")
        for command in rendered:
            print(f"  {command}")
        answer = input("Continue? [y/N] ").strip().casefold()
        if answer not in {"y", "yes"}:
            return {"status": "cancelled", "commands": rendered}
    for command in commands:
        try:
            subprocess.run(command, check=True)
        except (OSError, subprocess.CalledProcessError) as error:
            raise Doc2PdfError(f"Dependency installation failed: {subprocess.list2cmdline(command)}: {error}") from error
    result = doctor()
    if not result["ok"]:
        raise Doc2PdfError("LibreOffice is still unavailable after installation. Restart the shell and run doctor.")
    return {"status": "installed", **result, "commands": rendered}
