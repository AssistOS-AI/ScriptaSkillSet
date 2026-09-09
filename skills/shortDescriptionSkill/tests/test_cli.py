from __future__ import annotations

import json

from shortdescription_skill.cli import main


def test_doctor(capsys) -> None:
    assert main(["doctor"]) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["status"] == "ok"
    assert payload["beautifulsoup4"]
