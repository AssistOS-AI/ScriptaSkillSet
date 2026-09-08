from html2doc_skill.cli import main


def test_doctor(capsys) -> None:
    assert main(["doctor"]) == 0
    output = capsys.readouterr().out
    assert '"ok": true' in output
    assert '"visualRenderer": false' in output
