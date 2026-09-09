from __future__ import annotations

import json

import numpy as np
import pytest
import regex

from relevantkeywords_skill.core import (
    KeywordError,
    SynonymDictionary,
    analyze_html,
    detect_language_lightweight,
    extract_segments,
    load_synonym_dictionary,
    upsert_keywords_meta,
)


class FakeEmbedder:
    model_name = "test/multilingual"

    def encode(self, texts, *, query=False):
        vectors = []
        for text in texts:
            lowered = text.casefold()
            vector = np.array(
                [
                    lowered.count("science") + lowered.count("știin"),
                    lowered.count("zodiac") + lowered.count("astrolog"),
                    lowered.count("method") + lowered.count("metod"),
                    max(1, len(lowered.split())) / 20,
                ],
                dtype=np.float32,
            )
            vector /= np.linalg.norm(vector)
            vectors.append(vector)
        return np.stack(vectors)


def test_extract_segments_uses_reader_content_and_excludes_toc_and_bibliography():
    source = """<!doctype html><html lang="en"><body>
    <nav>site words</nav><main data-reader-content>
    <section class="toc"><p>Contents astrology</p></section>
    <h1>Science and the Zodiac</h1>
    <p>Astrology is examined with scientific methods.</p>
    <section class="bibliography"><p>Science reference science reference</p></section>
    </main></body></html>"""
    segments, language = extract_segments(source)
    combined = " ".join(item.text for item in segments)
    assert language == "en"
    assert "scientific methods" in combined
    assert "Contents" not in combined
    assert "reference" not in combined


def test_analysis_removes_stopwords_and_ranks_document_terms():
    source = """<!doctype html><html lang="en"><head></head><body><main data-reader-content>
    <h1>Zodiac science</h1>
    <p>The zodiac is studied through science and scientific methods.</p>
    <p>A scientific method tests zodiac claims with evidence.</p>
    <p>Science needs evidence, methods, and repeated tests.</p>
    </main></body></html>"""
    result = analyze_html(
        source,
        count=5,
        language="auto",
        synonyms=SynonymDictionary(None, {}, {}),
        embedder=FakeEmbedder(),
    )
    assert result.language == "en"
    assert result.language_method == "html-lang"
    assert len(result.keywords) <= 5
    assert any("zodiac" in item.normalized for item in result.keywords)
    assert all(item.normalized != "the" for item in result.keywords)
    assert all("https" not in item.normalized and "doi" not in item.normalized for item in result.keywords)


def test_lightweight_language_detection_has_safe_unknown_fallback():
    assert detect_language_lightweight("1234 !!!")[0] == "und"
    language, confidence = detect_language_lightweight(
        "the book and the author are in the house and the method is clear"
    )
    assert language == "en"
    assert confidence is not None


def test_synonym_dictionary_validates_language_and_overlap(tmp_path):
    dictionary = tmp_path / "synonyms.json"
    dictionary.write_text(
        json.dumps(
            {
                "language": "en",
                "groups": [
                    {"canonical": "method", "variants": ["approach"]},
                    {"canonical": "technique", "variants": ["approach"]},
                ],
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(KeywordError, match="multiple groups"):
        load_synonym_dictionary(dictionary, "en")


def test_synonym_aliases_consolidate_before_semantic_ranking():
    source = """<html lang="en"><body><main>
    <h1>Research method</h1>
    <p>The method provides evidence. This approach provides evidence.</p>
    <p>Every approach and method is tested as a research method.</p>
    </main></body></html>"""
    synonyms = SynonymDictionary(
        "en",
        aliases={"method": "method", "approach": "method"},
        canonical_display={"method": "method"},
    )
    result = analyze_html(source, count=5, language="auto", synonyms=synonyms, embedder=FakeEmbedder())
    method = next(item for item in result.keywords if item.normalized == "method")
    assert method.frequency >= 4
    assert "approach" in [variant.casefold() for variant in method.variants]


def test_non_latin_document_uses_unicode_candidates():
    source = """<html lang="zh"><body><main>
    <h1>人工智能研究</h1>
    <p>人工智能研究使用科学方法。人工智能需要可靠证据。</p>
    <p>科学方法支持人工智能研究。</p>
    </main></body></html>"""
    result = analyze_html(
        source,
        count=5,
        language="auto",
        synonyms=SynonymDictionary(None, {}, {}),
        embedder=FakeEmbedder(),
    )
    assert result.language == "zh"
    assert result.keywords
    assert any(regex.search(r"\p{Han}", item.keyword) for item in result.keywords)


def test_upsert_meta_preserves_body_bytes_and_is_idempotent():
    source = '<!doctype html>\n<html lang="en"><head><title>X</title></head><body>  Exact &amp; text\n</body></html>'
    first = upsert_keywords_meta(source, ["zodiac", "science"])
    second = upsert_keywords_meta(first, ["astrology"])
    assert first.split("<body>", 1)[1] == source.split("<body>", 1)[1]
    assert second.split("<body>", 1)[1] == source.split("<body>", 1)[1]
    assert second.count('name="keywords"') == 1
    assert 'content="astrology"' in second


def test_upsert_removes_duplicate_keyword_meta_tags():
    source = """<html><head><meta name="keywords" content="old"><meta NAME="keywords" content="older"></head><body>x</body></html>"""
    updated = upsert_keywords_meta(source, ["new"])
    assert updated.lower().count('name="keywords"') == 1
    assert 'content="new"' in updated
