from comprehensivesummary_skill.core import word_count


def test_unicode_word_count_supports_romanian_and_hyphenation() -> None:
    assert word_count("O sinteză bine-structurată păstrează ideea autorului.") == 6


def test_word_count_includes_numbers_in_reading_budget() -> None:
    assert word_count("A result from 2025 contains 42 examples.") == 7
