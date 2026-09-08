from translatehtml_skill.validation import _ngram_overlap, _script_result


def test_script_check_is_fast_and_only_applies_to_distinctive_scripts() -> None:
    text = "هذه فقرة عربية واضحة ومترجمة بشكل صحيح. " * 20
    script, ratio = _script_result(text, "ar")
    assert script == "arabic"
    assert ratio is not None and ratio > 0.8
    assert _script_result("Aceasta este o traducere românească. " * 20, "ro") == (None, None)


def test_ngram_overlap_detects_retained_source_sequences() -> None:
    source = "The quick brown fox jumps over the lazy dog every morning."
    assert _ngram_overlap(source, source) == 1.0
    assert _ngram_overlap(source, "Vulpea sprintenă sare peste câine în fiecare dimineață.") == 0.0
