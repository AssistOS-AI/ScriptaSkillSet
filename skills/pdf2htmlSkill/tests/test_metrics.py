from pdf2html_skill.validation import (
    MAX_SCREENSHOT_SEGMENT_HEIGHT,
    MAX_SCREENSHOT_SEGMENT_PIXELS,
    _coverage,
    _order_score,
    _segment_ranges,
    _tokens,
)


def test_token_normalization_and_coverage() -> None:
    source = _tokens("Știință, co-operare și AI.")
    output = _tokens("ȘTIINȚĂ co operare și AI plus")
    assert _coverage(source, output) == 1.0


def test_order_score_detects_reordering() -> None:
    source = _tokens("alpha beta gamma delta")
    assert _order_score(source, source) == 1.0
    assert _order_score(source, list(reversed(source))) == 0.0


def test_screenshot_segments_cover_long_document_without_oversized_images() -> None:
    width = 1440
    total_height = 166_375
    segments = _segment_ranges(total_height, width)
    assert segments[0][0] == 0
    assert sum(height for _top, height in segments) == total_height
    assert all(height <= MAX_SCREENSHOT_SEGMENT_HEIGHT for _top, height in segments)
    assert all(width * height <= MAX_SCREENSHOT_SEGMENT_PIXELS for _top, height in segments)
    assert segments[-1][0] + segments[-1][1] == total_height
