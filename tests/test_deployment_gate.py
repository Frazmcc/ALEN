from pathlib import Path

PAGES = Path(".github/workflows/pages.yml").read_text(encoding="utf-8")


def test_pages_requires_ci_and_codeql_before_deploy() -> None:
    assert "workflow_run:" in PAGES
    assert "- CodeQL" in PAGES
    assert "github.event.workflow_run.conclusion == 'success'" in PAGES
    assert "Verify all required CI checks passed" in PAGES
    assert '"test"' in PAGES
    assert '"Analyze Python and JavaScript"' in PAGES
    assert 'check.get("conclusion") != "success"' in PAGES
    assert "Checkout exact validated commit" in PAGES
    assert 'printf \'{"git_commit":"%s"}\\n\'' in PAGES
