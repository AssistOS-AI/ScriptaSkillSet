from __future__ import annotations

import os
from pathlib import Path
import subprocess


def test_single_launcher_invocation_bootstraps_and_runs_requested_command(
    tmp_path: Path,
) -> None:
    skill_root = tmp_path / "skill"
    scripts = skill_root / "scripts"
    scripts.mkdir(parents=True)
    source_launcher = Path(__file__).parents[1] / "scripts" / "pdf2html"
    launcher = scripts / "pdf2html"
    launcher.write_text(source_launcher.read_text(encoding="utf-8"), encoding="utf-8")
    launcher.chmod(0o755)

    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    log_path = tmp_path / "uv.log"
    fake_uv = fake_bin / "uv"
    fake_uv.write_text(
        "#!/bin/sh\n"
        "printf '%s\\n' \"$*\" >> \"$PDF2HTML_TEST_UV_LOG\"\n"
        "if [ \"${3:-}\" = sync ]; then mkdir -p \"$UV_PROJECT_ENVIRONMENT\"; fi\n",
        encoding="utf-8",
    )
    fake_uv.chmod(0o755)
    for name in ("pdfinfo", "pdftoppm"):
        executable = fake_bin / name
        executable.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        executable.chmod(0o755)

    environment = {
        **os.environ,
        "PATH": f"{fake_bin}:/usr/bin:/bin",
        "PDF2HTML_TEST_UV_LOG": str(log_path),
    }
    for _ in range(2):
        subprocess.run(
            [str(launcher), "convert", "book.pdf"],
            cwd=tmp_path,
            env=environment,
            check=True,
        )

    calls = log_path.read_text(encoding="utf-8").splitlines()
    assert calls.count("python install 3.12") == 2
    assert sum(" sync --managed-python --python 3.12" in call for call in calls) == 2
    assert sum("python -m playwright install chromium" in call for call in calls) == 1
    assert sum(call.endswith("run --no-sync pdf2html doctor") for call in calls) == 1
    assert sum(
        call.endswith("run --no-sync pdf2html convert book.pdf") for call in calls
    ) == 2
