"""Airplane category label modes control live labels while selection stays detailed."""
from pathlib import Path

APP = Path("web/app.js").read_text(encoding="utf-8")


def test_aircraft_group_labels_are_drawn_when_enabled():
    begin = APP.index("if(layers.aircraft){", APP.index("function draw(){"))
    end = APP.index("if(layers.satellites){", begin)
    block = APP[begin:end]
    assert "const active=selected?.id===a.id" in block
    assert "if(active){" in block
    assert "else if(aircraftLabelsOn(a)){" in block
    assert "drawAircraftIcon(visualType,iconSize" in block
    assert 'const callsign=a.callsign||a.name||"Aircraft"' in block
    assert "const label=String(a.callsign||a.name||a.hex||" in block
