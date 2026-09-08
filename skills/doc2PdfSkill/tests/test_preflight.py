from pathlib import Path

from doc2pdf_skill.models import RuntimeTools
from doc2pdf_skill import preflight


def test_macos_install_plan_only_includes_missing_tools(monkeypatch) -> None:
    monkeypatch.setattr(preflight.platform, "system", lambda: "Darwin")
    monkeypatch.setattr(preflight.shutil, "which", lambda name: "/usr/local/bin/brew" if name == "brew" else None)
    commands = preflight.install_commands(RuntimeTools(Path("/soffice"), None))
    assert commands == [["brew", "install", "ghostscript"]]


def test_install_is_cancelled_before_subprocess(monkeypatch) -> None:
    monkeypatch.setattr(preflight, "install_commands", lambda runtime=None: [["installer", "package"]])
    monkeypatch.setattr("builtins.input", lambda prompt: "n")
    called = False

    def run(*args, **kwargs):
        nonlocal called
        called = True

    monkeypatch.setattr(preflight.subprocess, "run", run)
    result = preflight.install_dependencies()
    assert result["status"] == "cancelled"
    assert not called
