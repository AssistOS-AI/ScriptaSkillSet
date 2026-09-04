from pdf2html_skill.typography import _emphasis


def test_detects_synthetic_italic_from_pdf_text_matrix() -> None:
    assert _emphasis("Subset+ArialMT", (0.75, 0.0, 0.1875, 0.75, 10, 20)) == (
        False,
        True,
    )
    assert _emphasis("Subset+ArialMT", (0.75, 0.0, 0.0, 0.75, 10, 20)) == (
        False,
        False,
    )
