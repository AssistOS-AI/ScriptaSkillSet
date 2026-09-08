from doc2pdf_skill import cli


def test_doctor_exit_status_and_json(monkeypatch, capsys) -> None:
    monkeypatch.setattr(cli, "doctor", lambda: {"ok": True, "libreOffice": "/soffice"})
    assert cli.main(["doctor"]) == 0
    assert '"libreOffice": "/soffice"' in capsys.readouterr().out


def test_doctor_fails_when_libreoffice_is_missing(monkeypatch, capsys) -> None:
    monkeypatch.setattr(cli, "doctor", lambda: {"ok": False, "libreOffice": None})
    assert cli.main(["doctor"]) == 1
    assert '"ok": false' in capsys.readouterr().out


def test_profile_choices_are_enforced() -> None:
    parser = cli._parser()
    args = parser.parse_args(["convert", "book.docx", "--profile", "compact"])
    assert args.profile == "compact"
