import math


DEG = math.pi / 180.0
RAD = 180.0 / math.pi


def geodetic_to_ecef(lat_deg: float, lon_deg: float, alt_m: float) -> tuple[float, float, float]:
    a = 6378137.0
    e2 = 6.69437999014e-3
    lat = lat_deg * DEG
    lon = lon_deg * DEG
    sin_lat = math.sin(lat)
    cos_lat = math.cos(lat)
    n = a / math.sqrt(1.0 - e2 * sin_lat * sin_lat)
    return (
        (n + alt_m) * cos_lat * math.cos(lon),
        (n + alt_m) * cos_lat * math.sin(lon),
        (n * (1.0 - e2) + alt_m) * sin_lat,
    )


def topocentric_altaz(
    observer_lat: float,
    observer_lon: float,
    observer_alt_m: float,
    target_lat: float,
    target_lon: float,
    target_alt_m: float,
) -> tuple[float, float, float]:
    ox, oy, oz = geodetic_to_ecef(observer_lat, observer_lon, observer_alt_m)
    tx, ty, tz = geodetic_to_ecef(target_lat, target_lon, target_alt_m)
    dx, dy, dz = tx - ox, ty - oy, tz - oz
    lat = observer_lat * DEG
    lon = observer_lon * DEG
    east = -math.sin(lon) * dx + math.cos(lon) * dy
    north = (
        -math.sin(lat) * math.cos(lon) * dx
        - math.sin(lat) * math.sin(lon) * dy
        + math.cos(lat) * dz
    )
    up = (
        math.cos(lat) * math.cos(lon) * dx
        + math.cos(lat) * math.sin(lon) * dy
        + math.sin(lat) * dz
    )
    horizontal = math.hypot(east, north)
    slant = math.hypot(horizontal, up)
    az = math.degrees(math.atan2(east, north)) % 360.0
    el = math.degrees(math.atan2(up, horizontal))
    return az, el, slant / 1000.0


def destination(lat_deg: float, lon_deg: float, bearing_deg: float, distance_m: float) -> tuple[float, float]:
    radius_m = 6371008.8
    angular = distance_m / radius_m
    bearing = bearing_deg * DEG
    lat1 = lat_deg * DEG
    lon1 = lon_deg * DEG
    lat2 = math.asin(
        math.sin(lat1) * math.cos(angular)
        + math.cos(lat1) * math.sin(angular) * math.cos(bearing)
    )
    lon2 = lon1 + math.atan2(
        math.sin(bearing) * math.sin(angular) * math.cos(lat1),
        math.cos(angular) - math.sin(lat1) * math.sin(lat2),
    )
    return lat2 * RAD, ((lon2 * RAD + 540.0) % 360.0) - 180.0


def test_same_altitude_near_aircraft_appears_much_higher_than_far_aircraft() -> None:
    observer_lat, observer_lon, observer_alt = 55.86, -4.25, 50.0
    target_alt = 14000.0 * 0.3048
    near_lat, near_lon = destination(observer_lat, observer_lon, 90.0, 5.0 * 1609.344)
    far_lat, far_lon = destination(observer_lat, observer_lon, 90.0, 50.0 * 1609.344)

    _az_near, near_el, _near_range = topocentric_altaz(
        observer_lat, observer_lon, observer_alt, near_lat, near_lon, target_alt
    )
    _az_far, far_el, _far_range = topocentric_altaz(
        observer_lat, observer_lon, observer_alt, far_lat, far_lon, target_alt
    )

    assert near_el > 25.0
    assert far_el < 3.5
    assert near_el > far_el * 8.0


def test_aircraft_directly_overhead_is_at_zenith() -> None:
    observer_lat, observer_lon, observer_alt = 55.86, -4.25, 50.0
    _az, elevation, slant_km = topocentric_altaz(
        observer_lat,
        observer_lon,
        observer_alt,
        observer_lat,
        observer_lon,
        14000.0 * 0.3048,
    )
    assert elevation > 89.99
    assert 4.1 < slant_km < 4.3
