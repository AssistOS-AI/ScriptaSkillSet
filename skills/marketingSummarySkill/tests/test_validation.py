from pathlib import Path

from marketingsummary_skill.core import file_sha256
from marketingsummary_skill.validation import validate_marketing_summary


def test_validation_rejects_visible_internal_data(tmp_path: Path) -> None:
    source = tmp_path / "source.html"
    source.write_text('<html lang="en"><body><p>Questions remain open without answers.</p></body></html>', encoding="utf-8")
    output = tmp_path / "output.html"
    output.write_text(
        f'''<html lang="en"><head>
<meta name="marketing-summary-generator" content="marketingsummary-skill">
<meta name="marketing-summary-source-sha256" content="{file_sha256(source)}">
<meta name="marketing-summary-minimum-words" content="1">
<meta name="marketing-summary-maximum-words" content="100">
<meta name="marketing-summary-actual-words" content="7">
</head><body><article data-marketing-summary><h1>Questions remain open</h1>
<h2>Without answers</h2><p class="reading-time">Internal words</p><p>Questions remain open.</p><p>Answers remain hidden.</p>
</article></body></html>''',
        encoding="utf-8",
    )
    report = validate_marketing_summary(source, output)
    assert report["status"] == "failed"
    assert any(item["code"] == "internal-data-visible" for item in report["findings"])
