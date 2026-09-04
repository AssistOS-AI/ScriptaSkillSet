from pdf2html_skill.images import _caption_is_below


def test_detects_caption_below_image_from_source_geometry() -> None:
    lines = [
        {
            "text": "Figure 3.1. A long ReAct trajectory can turn partial observation",
            "top": 310.0,
        }
    ]

    assert (
        _caption_is_below(
            lines,
            "Figure 3.1. A long ReAct trajectory can turn partial observation into a transcript.",
            100.0,
            300.0,
        )
        is True
    )


def test_detects_caption_above_image_from_source_geometry() -> None:
    lines = [{"text": "Figure 1. A diagram", "top": 80.0}]

    assert _caption_is_below(lines, "Figure 1. A diagram", 100.0, 300.0) is False
