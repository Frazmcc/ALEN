from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGES = (ROOT / ".github" / "workflows" / "pages.yml").read_text(encoding="utf-8")
LIVE_SMOKE = (ROOT / ".github" / "workflows" / "live-web-smoke.yml").read_text(encoding="utf-8")


def test_pages_concurrency_does_not_mix_pr_and_production_runs() -> None:
    assert (
        "group: pages-${{ github.event.workflow_run.event }}"
        "-${{ github.event.workflow_run.head_branch }}"
    ) in PAGES
    assert "cancel-in-progress: true" in PAGES
    assert (
        "github.event.workflow_run.event == 'push'"
        " && github.event.workflow_run.head_branch == 'main'"
    ) in PAGES


def test_live_smoke_skipped_runs_cannot_cancel_successful_probe() -> None:
    assert (
        "group: live-web-smoke-${{ github.event.workflow_run.conclusion }}"
    ) in LIVE_SMOKE
    assert "if: github.event.workflow_run.conclusion == 'success'" in LIVE_SMOKE
    assert "cancel-in-progress: true" in LIVE_SMOKE
