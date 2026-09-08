from humanisehtml_skill.validation import style_penalty


def test_style_penalty_detects_multilingual_canned_phrases() -> None:
    assert style_penalty("It is important to note that this serves as a testament.") >= 2
    assert style_penalty("Este important de menționat că, în concluzie, rezultatul rămâne.") >= 2
    assert style_penalty("The result remained stable after the second test.") == 0


def test_style_penalty_detects_repeated_sentence_openings() -> None:
    text = (
        "This result changed after testing. This result improved after review. "
        "This result remained stable overnight. This result was recorded again."
    )
    assert style_penalty(text) >= 2
