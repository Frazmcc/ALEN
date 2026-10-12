"""Aircraft labels should appear only for the selected target."""
from pathlib import Path

APP=Path("web/app.js").read_text(encoding="utf-8")


def test_aircraft_labels_only_when_selected():
    begin=APP.index("if(layers.aircraft){",APP.index("function draw(){"))
    end=APP.index("if(layers.satellites){",begin)
    block=APP[begin:end]
    assert "const active=selected?.id===a.id" in block
    assert "if(active){" in block
    assert "if(aircraftLabelsOn(a)){" not in block
    assert "drawAircraftIcon(visualType,iconSize" in block
    assert "const callsign=a.callsign||a.name||\"Aircraft\"" in block
