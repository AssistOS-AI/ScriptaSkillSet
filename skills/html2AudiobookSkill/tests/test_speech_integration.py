"""Opt-in real ebook2audiobook/Piper tests; downloads native models on first use."""
import os
from pathlib import Path

import pytest

from html2audiobook_skill.book import read_book
from html2audiobook_skill.pipeline import convert, workspace
from html2audiobook_skill.media import validate

pytestmark = pytest.mark.skipif(os.environ.get("RUN_HTML2AUDIOBOOK_TTS") != "1",
                                reason="Set RUN_HTML2AUDIOBOOK_TTS=1 to run the installed speech engine")

SAMPLES = {
    "en": "A book begins with a question. Listen carefully and discover a new idea.",
    "fr": "Un livre commence par une question. Écoutez attentivement et découvrez une nouvelle idée.",
    "de": "Ein Buch beginnt mit einer Frage. Hören Sie aufmerksam zu und entdecken Sie eine neue Idee.",
    "es": "Un libro comienza con una pregunta. Escucha con atención y descubre una idea nueva.",
    "pt": "Um livro começa com uma pergunta. Ouça com atenção e descubra uma nova ideia.",
    "it": "Un libro comincia con una domanda. Ascolta con attenzione e scopri una nuova idea.",
    "ro": "O carte începe cu o întrebare. Ascultă cu atenție și descoperă o idee nouă.",
    "pl": "Książka zaczyna się od pytania. Słuchaj uważnie i odkryj nowy pomysł.",
}


@pytest.mark.parametrize("language", SAMPLES)
def test_real_voice(tmp_path, language):
    source = tmp_path / "book.html"
    source.write_text(f'<html lang="{language}"><head><title>Audio test</title></head>'
                      f'<body><main data-reader-content><p>{SAMPLES[language]}</p></main></body></html>', encoding="utf-8")
    book = read_book(source)
    output = tmp_path / "audiobook"
    with workspace(output) as work:
        result = convert(book, output, work)
    assert result["status"] == "passed"
    assert validate(output)["chapters"] == 1


def test_complete_romanian_fixture(tmp_path):
    source = Path(__file__).parent / "fixtures/romanian.html"
    book = read_book(source)
    output = tmp_path / "romanian-audiobook"
    with workspace(output) as work:
        result = convert(book, output, work)
    assert result["status"] == "passed"
    assert validate(output)["chapters"] == 2
