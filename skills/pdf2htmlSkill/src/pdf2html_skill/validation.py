from __future__ import annotations

import io
import json
import math
import platform
import re
import subprocess
import tempfile
from collections import Counter
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

from bs4 import BeautifulSoup
from PIL import Image, ImageChops, ImageDraw
from playwright.sync_api import sync_playwright

from .models import Finding, PdfProfile, ValidationReport

TOKEN_PATTERN = re.compile(r"\w+", re.UNICODE)
MAX_SCREENSHOT_SEGMENT_HEIGHT = 12_000
MAX_SCREENSHOT_SEGMENT_PIXELS = 20_000_000


def _tokens(text: str) -> list[str]:
    return TOKEN_PATTERN.findall(text.casefold().replace("\u00ad", ""))


def _coverage(source: list[str], output: list[str]) -> float:
    if not source:
        return 1.0
    source_counts = Counter(source)
    output_counts = Counter(output)
    matched = sum(min(count, output_counts[token]) for token, count in source_counts.items())
    return matched / len(source)


def _order_score(source: list[str], output: list[str]) -> float:
    if len(source) < 2:
        return 1.0
    source_pairs = Counter(zip(source, source[1:]))
    output_pairs = Counter(zip(output, output[1:]))
    matched = sum(min(count, output_pairs[pair]) for pair, count in source_pairs.items())
    return matched / sum(source_pairs.values())


def _local_asset(html_path: Path, src: str) -> Path | None:
    parsed = urlparse(src)
    if parsed.scheme in ("data", "http", "https") or src.startswith("#"):
        return None
    return (html_path.parent / unquote(parsed.path)).resolve()


def _validate_images(soup: BeautifulSoup, html_path: Path) -> tuple[int, list[Finding]]:
    findings: list[Finding] = []
    images = soup.find_all("img")
    for index, image in enumerate(images, start=1):
        src = str(image.get("src", ""))
        if not src:
            findings.append(Finding("error", "image-src-missing", f"Image {index} has no src."))
            continue
        asset = _local_asset(html_path, src)
        if asset is None:
            if src.startswith(("http://", "https://")):
                findings.append(Finding("error", "remote-image", f"Image {index} is not local.", {"src": src}))
            continue
        if not asset.is_relative_to(html_path.parent.resolve()):
            findings.append(Finding("error", "image-outside-output", f"Image escapes the output folder: {src}"))
            continue
        if not asset.is_file():
            findings.append(Finding("error", "image-file-missing", f"Image asset is missing: {src}"))
            continue
        try:
            with Image.open(asset) as opened:
                opened.verify()
            with Image.open(asset) as opened:
                if opened.width <= 0 or opened.height <= 0:
                    raise ValueError("zero-sized image")
        except Exception as error:
            findings.append(Finding("error", "image-invalid", f"Image asset is invalid: {src}", {"error": str(error)}))
    return len(images), findings


def _segment_ranges(total_height: int, width: int) -> list[tuple[int, int]]:
    safe_height = max(
        1,
        min(MAX_SCREENSHOT_SEGMENT_HEIGHT, MAX_SCREENSHOT_SEGMENT_PIXELS // width),
    )
    return [
        (top, min(safe_height, total_height - top))
        for top in range(0, max(1, total_height), safe_height)
    ]


def _browser_checks(
    html_path: Path, keep_dir: Path | None
) -> tuple[dict[str, Any], list[Finding], list[bytes]]:
    findings: list[Finding] = []
    metrics: dict[str, Any] = {"viewports": {}}
    desktop_samples: list[bytes] = []
    with sync_playwright() as manager:
        browser = manager.chromium.launch(headless=True)
        metrics["chromium"] = browser.version
        for width in (1440, 1024, 390):
            segment_height = min(
                MAX_SCREENSHOT_SEGMENT_HEIGHT,
                MAX_SCREENSHOT_SEGMENT_PIXELS // width,
            )
            page = browser.new_page(
                viewport={"width": width, "height": segment_height},
                device_scale_factor=1,
            )
            console_errors: list[str] = []
            page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
            page.goto(html_path.as_uri(), wait_until="load")
            page.evaluate(
                """async () => {
                  const images = [...document.images];
                  images.forEach(image => image.loading = 'eager');
                  await Promise.all(images.map(image => {
                    if (image.complete) return Promise.resolve();
                    return new Promise(resolve => {
                      image.addEventListener('load', resolve, { once: true });
                      image.addEventListener('error', resolve, { once: true });
                    });
                  }));
                }"""
            )
            result = page.evaluate(
                """() => ({
                  documentHeight: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
                  bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
                  brokenImages: [...document.images].filter(i => !i.complete || i.naturalWidth === 0).length,
                  overflowingElements: [...document.querySelectorAll('body *')].filter(el => {
                    if (el.closest('.table-scroll')) return false;
                    const r = el.getBoundingClientRect();
                    return r.right > document.documentElement.clientWidth + 1 || r.left < -1;
                  }).length
                })"""
            )
            segments = _segment_ranges(int(result["documentHeight"]), width)
            sample_indexes = sorted({0, len(segments) // 2, len(segments) - 1})
            for index, (top, height) in enumerate(segments):
                try:
                    scroll_top = min(
                        top,
                        max(0, int(result["documentHeight"]) - segment_height),
                    )
                    page.evaluate("position => window.scrollTo(0, position)", scroll_top)
                    page.wait_for_timeout(25)
                    screenshot = page.screenshot(full_page=False)
                except Exception as error:
                    findings.append(
                        Finding(
                            "error",
                            "browser-segment-capture",
                            f"Could not capture segment {index + 1} at {width}px.",
                            {
                                "top": top,
                                "height": height,
                                "error": str(error),
                            },
                        )
                    )
                    continue
                if width == 1440 and index in sample_indexes:
                    desktop_samples.append(screenshot)
                if keep_dir and index in sample_indexes:
                    (keep_dir / f"html-{width}-segment-{index + 1:04d}.png").write_bytes(screenshot)
            result["segmentCount"] = len(segments)
            result["segmentHeightLimit"] = min(
                MAX_SCREENSHOT_SEGMENT_HEIGHT,
                MAX_SCREENSHOT_SEGMENT_PIXELS // width,
            )
            result["sampledSegments"] = [index + 1 for index in sample_indexes]
            result["consoleErrors"] = console_errors
            metrics["viewports"][str(width)] = result
            if result["brokenImages"]:
                findings.append(Finding("error", "browser-broken-images", f"Broken images at {width}px.", result))
            if result["bodyOverflow"] or result["overflowingElements"]:
                findings.append(Finding("error", "browser-overflow", f"Content overflows at {width}px.", result))
            if console_errors:
                findings.append(Finding("error", "browser-console", f"Browser console errors at {width}px.", {"errors": console_errors}))
            page.close()
        browser.close()
    return metrics, findings, desktop_samples


def _render_pdf_samples(profile: PdfProfile, output_dir: Path | None) -> list[Image.Image]:
    candidates = sorted({1, max(1, (profile.pages + 1) // 2), profile.pages})
    images: list[Image.Image] = []
    with tempfile.TemporaryDirectory(prefix="pdf2html-render-") as temp_dir:
        for page_number in candidates:
            prefix = Path(temp_dir) / f"page-{page_number:04d}"
            completed = subprocess.run(
                ["pdftoppm", "-f", str(page_number), "-l", str(page_number), "-singlefile", "-r", "120", "-png", str(profile.path), str(prefix)],
                capture_output=True,
                text=True,
                check=False,
            )
            if completed.returncode != 0:
                raise RuntimeError(completed.stderr.strip() or "pdftoppm failed")
            image = Image.open(prefix.with_suffix(".png")).convert("RGB")
            image.load()
            images.append(image)
            if output_dir:
                image.save(output_dir / f"pdf-page-{page_number:04d}.png")
    return images


def _visual_artifacts(
    source_images: list[Image.Image], html_pngs: list[bytes], output_dir: Path | None
) -> float | None:
    if not source_images or not html_pngs:
        return None
    target_width = 700
    thumbs: list[Image.Image] = []
    for image in source_images:
        height = max(1, round(image.height * target_width / image.width))
        thumbs.append(image.resize((target_width, height)))
    source_height = sum(image.height for image in thumbs)
    source_sheet = Image.new("RGB", (target_width, source_height), "white")
    y = 0
    for image in thumbs:
        source_sheet.paste(image, (0, y))
        y += image.height

    html_thumbs: list[Image.Image] = []
    for payload in html_pngs:
        html_image = Image.open(io.BytesIO(payload)).convert("RGB")
        html_height = max(1, round(html_image.height * target_width / html_image.width))
        html_thumb = html_image.resize((target_width, html_height))
        html_thumbs.append(html_thumb.crop((0, 0, target_width, min(1600, html_height))))
    html_sheet = Image.new("RGB", (target_width, sum(image.height for image in html_thumbs)), "white")
    y = 0
    for image in html_thumbs:
        html_sheet.paste(image, (0, y))
        y += image.height

    comparison_height = max(source_sheet.height, html_sheet.height)
    comparison = Image.new("RGB", (target_width * 2 + 24, comparison_height + 40), "#e2e8f0")
    comparison.paste(source_sheet, (0, 40))
    comparison.paste(html_sheet, (target_width + 24, 40))
    draw = ImageDraw.Draw(comparison)
    draw.text((8, 10), "PDF samples", fill="#0f172a")
    draw.text((target_width + 32, 10), "Semantic HTML", fill="#0f172a")
    if output_dir:
        comparison.save(output_dir / "visual-comparison.png")

    height = min(source_sheet.height, html_sheet.height, 2400)
    left = source_sheet.crop((0, 0, target_width, height))
    right = html_sheet.crop((0, 0, target_width, height))
    difference = ImageChops.difference(left, right)
    histogram = difference.histogram()
    squared = sum((index % 256) ** 2 * count for index, count in enumerate(histogram))
    rms = math.sqrt(squared / (target_width * height * 3))
    return round(max(0.0, 1.0 - rms / 255.0), 4)


def validate_output(
    profile: PdfProfile,
    html_path: Path,
    *,
    expected_tables: int | None = None,
    expected_pictures: int | None = None,
    keep_qa_artifacts: bool = False,
    report_dir: Path | None = None,
) -> ValidationReport:
    html_path = html_path.resolve()
    if report_dir is not None:
        report_dir = report_dir.resolve()
        report_dir.mkdir(parents=True, exist_ok=True)
    preview_dir = report_dir / "previews" if keep_qa_artifacts and report_dir else None
    if preview_dir:
        preview_dir.mkdir(parents=True, exist_ok=True)

    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    source_tokens = _tokens(profile.text)
    output_tokens = _tokens(soup.get_text(" ", strip=True))
    coverage = _coverage(source_tokens, output_tokens)
    order = _order_score(source_tokens, output_tokens)
    findings: list[Finding] = []
    page_anchors = {
        str(element.get("id"))
        for element in soup.find_all(id=True)
        if re.fullmatch(r"page_\d+", str(element.get("id")))
    }
    expected_anchors = {f"page_{number}" for number in range(1, profile.pages + 1)}
    if page_anchors != expected_anchors:
        findings.append(
            Finding(
                "error",
                "source-page-anchors",
                "HTML page anchors do not match the source PDF pages.",
                {
                    "expected": len(expected_anchors),
                    "actual": len(page_anchors),
                    "missing": sorted(expected_anchors - page_anchors),
                    "unexpected": sorted(page_anchors - expected_anchors),
                },
            )
        )

    if coverage < 0.95:
        findings.append(Finding("error", "text-coverage", "Text coverage is below 95%.", {"score": coverage}))
    elif coverage < 0.98:
        findings.append(Finding("warning", "text-coverage", "Text coverage is below 98%.", {"score": coverage}))
    if order < 0.90:
        findings.append(Finding("error", "text-order", "Text order score is below 90%.", {"score": order}))
    elif order < 0.95:
        findings.append(Finding("warning", "text-order", "Text order score is below 95%.", {"score": order}))

    image_count, image_findings = _validate_images(soup, html_path)
    findings.extend(image_findings)
    table_count = len(soup.find_all("table"))
    normalized_contents_count = len(soup.select("nav.contents-list"))
    represented_table_regions = table_count + normalized_contents_count
    if expected_tables is not None and represented_table_regions != expected_tables:
        findings.append(
            Finding(
                "error",
                "table-count",
                "HTML structural regions differ from Docling table output.",
                {
                    "expected": expected_tables,
                    "tables": table_count,
                    "normalizedContentsLists": normalized_contents_count,
                },
            )
        )
    if expected_pictures is not None and image_count < expected_pictures:
        findings.append(Finding("error", "picture-count", "HTML contains fewer images than Docling picture items.", {"expected": expected_pictures, "actual": image_count}))

    browser_metrics, browser_findings, desktop_samples = _browser_checks(html_path, preview_dir)
    findings.extend(browser_findings)
    source_images = _render_pdf_samples(profile, preview_dir)
    visual_similarity = _visual_artifacts(source_images, desktop_samples, preview_dir)

    status = "failed" if any(item.severity == "error" for item in findings) else "passed_with_warnings" if findings else "passed"
    metrics = {
        "sourcePages": profile.pages,
        "sourceTokens": len(source_tokens),
        "htmlTokens": len(output_tokens),
        "textCoverage": round(coverage, 4),
        "textOrder": round(order, 4),
        "tables": table_count,
        "normalizedContentsLists": normalized_contents_count,
        "images": image_count,
        "sourcePageAnchors": len(page_anchors),
        "externalLinks": len(soup.find_all("a", href=re.compile(r"^https?://"))),
        "internalPageLinks": len(soup.find_all("a", href=re.compile(r"^#page_\d+$"))),
        "visualSimilarityInformational": visual_similarity,
        **browser_metrics,
    }
    environment = {"python": platform.python_version(), "platform": platform.platform()}
    report = ValidationReport(status, metrics, findings, environment)
    if report_dir is not None:
        (report_dir / "report.json").write_text(
            json.dumps(report.to_dict(), indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        _write_report_html(report, report_dir / "report.html", keep_qa_artifacts)
    return report


def _write_report_html(report: ValidationReport, path: Path, has_previews: bool) -> None:
    rows = "".join(
        f"<tr><td>{item.severity}</td><td>{item.code}</td><td>{item.message}</td></tr>"
        for item in report.findings
    ) or '<tr><td colspan="3">No findings.</td></tr>'
    preview = '<p><a href="previews/visual-comparison.png">Open visual comparison</a></p>' if has_previews else ""
    payload = json.dumps(report.metrics, indent=2, ensure_ascii=False)
    path.write_text(
        f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PDF to HTML QA</title><style>body{{font:16px/1.5 system-ui;max-width:70rem;margin:2rem auto;padding:0 1rem}}table{{border-collapse:collapse;width:100%}}th,td{{border:1px solid #bbb;padding:.5rem;text-align:left}}pre{{overflow:auto;background:#f3f4f6;padding:1rem}}</style></head><body><h1>PDF to HTML QA</h1><p>Status: <strong>{report.status}</strong></p>{preview}<h2>Findings</h2><table><thead><tr><th>Severity</th><th>Code</th><th>Message</th></tr></thead><tbody>{rows}</tbody></table><h2>Metrics</h2><pre>{payload}</pre></body></html>""",
        encoding="utf-8",
    )
