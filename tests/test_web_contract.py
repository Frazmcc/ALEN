from pathlib import Path

HTML = Path("web/index.html").read_text(encoding="utf-8")
APP = Path("web/app.js").read_text(encoding="utf-8")


def test_web_identity_and_security_contract() -> None:
    assert "ALEN" in HTML
    assert "Astronomical Live Environment &amp; Navigation" in HTML
    assert 'http-equiv="Content-Security-Policy"' in HTML
    for directive in (
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "connect-src 'self'",
        "img-src 'self' data:",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ):
        assert directive in HTML


def test_selection_is_explicitly_toggleable() -> None:
    assert "if(selected?.id===o.id)clearSelection();else showObject(o)" in APP
    assert "function clearSelection()" in APP


def test_no_inline_remote_dependencies() -> None:
    assert "https://" not in HTML
    assert "<script src=" in HTML


def test_alen_brand_logo_and_favicon_are_present() -> None:
    assert 'class="brand-mark"' in HTML
    assert 'rel="icon"' in HTML
    assert 'rel="apple-touch-icon"' in HTML
    assert "./assets/alen-logo.png?v=2" in HTML
    assert Path("web/assets/alen-logo.png").is_file()
    assert "data:image/png;base64," not in HTML


def test_docs_do_not_reference_external_comparison_project() -> None:
    forbidden = "stel" + "larium"
    for path in Path(".").rglob("*.md"):
        assert forbidden not in path.read_text(encoding="utf-8").lower()
