"""Workflow_run triggers have a different event value from the original push."""
from pathlib import Path


def test_live_orbit_monitor_follows_successful_main_pages_deploy():
    workflow=Path(".github/workflows/live-orbit-integrity.yml").read_text(encoding="utf-8")
    assert "workflow_run:" in workflow
    assert "Deploy hosted web to GitHub Pages" in workflow
    assert "github.event.workflow_run.head_branch == 'main'" in workflow
    assert "github.event.workflow_run.conclusion == 'success'" in workflow
    assert "github.event.workflow_run.event == 'push'" not in workflow
    assert "cron: '23 4 * * *'" in workflow
