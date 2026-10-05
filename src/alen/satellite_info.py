from __future__ import annotations

from dataclasses import dataclass
from html import unescape
from html.parser import HTMLParser
import re
import time
from urllib.parse import urlparse

import httpx

from .cache import SharedCache, shared_cache


@dataclass(frozen=True)
class SatellitePhoto:
    image_url: str
    source_url: str
    credit: str
    license_name: str
    match: str


class SatelliteInfoProvider:
    SATCAT_URL = "https://celestrak.org/satcat/records.php"
    SATNOGS_URL = "https://db.satnogs.org/api/satellites/"
    COMMONS_API_URL = "https://commons.wikimedia.org/w/api.php"
    SATNOGS_MEDIA_BASE = "https://db-satnogs.freetls.fastly.net/media/"
    ISSTRACKER_PAGE_URL = "https://isstracker.pl/en/satellites/{norad}"
    CACHE_TTL_SECONDS = 86400
    REFRESH_LOCK_SECONDS = 30
    MAX_IMAGE_BYTES = 4 * 1024 * 1024

    OWNER_NAMES = {
        "PRC": "People's Republic of China",
        "US": "United States",
        "CIS": "Commonwealth of Independent States / former USSR",
        "RU": "Russia",
        "UK": "United Kingdom",
        "GB": "United Kingdom",
        "FR": "France",
        "GER": "Germany",
        "JPN": "Japan",
        "JP": "Japan",
        "IND": "India",
        "ESA": "European Space Agency",
        "EUME": "EUMETSAT",
        "CA": "Canada",
        "IT": "Italy",
        "SPN": "Spain",
        "BRAZ": "Brazil",
        "SKOR": "South Korea",
        "NKOR": "North Korea",
        "ISRA": "Israel",
        "AUS": "Australia",
        "UAE": "United Arab Emirates",
    }

    LAUNCH_SITES = {
        "TSC": "Taiyuan Satellite Launch Center, China",
        "XSC": "Xichang Satellite Launch Center, China",
        "JSC": "Jiuquan Satellite Launch Center, China",
        "WSC": "Wenchang Space Launch Site, China",
        "AFETR": "Cape Canaveral, Florida, USA",
        "AFWTR": "Vandenberg Space Force Base, California, USA",
        "KSCUT": "Kennedy Space Center, Florida, USA",
        "FRGUI": "Guiana Space Centre, Kourou, French Guiana",
        "TYMSC": "Baikonur Cosmodrome, Kazakhstan",
        "PLMSC": "Plesetsk Cosmodrome, Russia",
        "VOSTO": "Vostochny Cosmodrome, Russia",
        "SNMLP": "Satish Dhawan Space Centre, India",
        "KYMTR": "Tanegashima Space Center, Japan",
    }

    TYPE_NAMES = {
        "PAY": "Payload / spacecraft",
        "R/B": "Rocket body",
        "DEB": "Debris",
        "UNK": "Unknown object",
    }

    STATUS_NAMES = {
        "+": "Operational",
        "-": "Non-operational",
        "P": "Partially operational",
        "B": "Backup / standby",
        "S": "Spare",
        "X": "Extended mission",
        "D": "Decayed",
    }

    def __init__(self, cache: SharedCache | None = None) -> None:
        self._cache = cache or shared_cache

    def lookup(self, norad: int, name: str = "") -> dict[str, object] | None:
        norad = int(norad)
        key = f"satellite-info:{norad}"
        cached = self._cache.get_json(key)
        if isinstance(cached, dict) and "found" in cached:
            value = cached.get("value")
            return value if isinstance(value, dict) else None

        token = self._cache.acquire_lock(key, ttl_seconds=self.REFRESH_LOCK_SECONDS)
        if token is None:
            for _ in range(60):
                time.sleep(0.05)
                cached = self._cache.get_json(key)
                if isinstance(cached, dict) and "found" in cached:
                    value = cached.get("value")
                    return value if isinstance(value, dict) else None
            return None

        try:
            return self._lookup_uncached(norad, name, key)
        finally:
            self._cache.release_lock(key, token)

    def _lookup_uncached(
        self,
        norad: int,
        name: str,
        cache_key: str,
    ) -> dict[str, object] | None:
        satcat = self._satcat(norad)
        satnogs = self._satnogs(norad)
        if satcat is None and satnogs is None:
            self._cache.set_json(
                cache_key,
                {"found": False, "value": None},
                ttl_seconds=3600,
            )
            return None

        object_name = str((satcat or {}).get("OBJECT_NAME") or (satnogs or {}).get("name") or name or f"NORAD {norad}").strip()
        object_type_code = str((satcat or {}).get("OBJECT_TYPE") or "").strip().upper()
        object_type = self.TYPE_NAMES.get(object_type_code, object_type_code or "Artificial satellite")
        owner_code = str((satcat or {}).get("OWNER") or "").strip().upper()
        satnogs_operator = _clean((satnogs or {}).get("operator"))
        owner = satnogs_operator or self.OWNER_NAMES.get(owner_code, owner_code or "Not publicly listed")

        launch_site_code = str((satcat or {}).get("LAUNCH_SITE") or "").strip().upper()
        launch_site = self.LAUNCH_SITES.get(launch_site_code, launch_site_code or "Not publicly listed")
        launch_date = _clean((satcat or {}).get("LAUNCH_DATE")) or _clean((satnogs or {}).get("launched")) or "Not publicly listed"
        decay_date = _clean((satcat or {}).get("DECAY_DATE"))

        description = _clean((satnogs or {}).get("description"))
        purpose = description or _purpose_for(object_type_code, object_name)
        life_expectancy = _life_expectancy(description, object_type_code)
        cost = _cost_text(object_type_code)

        photo = self.find_isstracker_photo(norad, object_name)
        if photo is None:
            photo = self._satnogs_photo(satnogs)
        if photo is None:
            photo = self._commons_photo(object_name, object_type_code)

        status = _clean((satnogs or {}).get("status"))
        if not status:
            status = self.STATUS_NAMES.get(str((satcat or {}).get("OPS_STATUS_CODE") or "").strip().upper(), "")
        if decay_date:
            status = f"Decayed / re-entered {decay_date}"
        elif not status:
            status = "In orbit" if satcat else "Unknown"

        result: dict[str, object] = {
            "name": object_name,
            "norad": norad,
            "international_id": _clean((satcat or {}).get("OBJECT_ID")),
            "object_type": object_type,
            "owner": owner,
            "country": self.OWNER_NAMES.get(owner_code, owner_code or _country_text((satnogs or {}).get("countries"))),
            "status": status,
            "purpose": purpose,
            "launch_date": launch_date,
            "launch_site": launch_site,
            "decay_date": decay_date or None,
            "life_expectancy": life_expectancy,
            "cost": cost,
            "period_minutes": _number((satcat or {}).get("PERIOD")),
            "inclination_deg": _number((satcat or {}).get("INCLINATION")),
            "apogee_km": _number((satcat or {}).get("APOGEE")),
            "perigee_km": _number((satcat or {}).get("PERIGEE")),
            "rcs_m2": _number((satcat or {}).get("RCS")),
            "website": _https_url((satnogs or {}).get("website")),
            "satnogs_url": f"https://db.satnogs.org/satellite/{norad}/",
            "celestrak_url": f"https://celestrak.org/satcat/records.php?CATNR={norad}",
            "photo": None,
        }
        if photo is not None:
            result["photo"] = {
                "image_url": photo.image_url,
                "source_url": photo.source_url,
                "credit": photo.credit,
                "license": photo.license_name,
                "match": photo.match,
            }

        self._cache.set_json(
            cache_key,
            {"found": True, "value": result},
            ttl_seconds=self.CACHE_TTL_SECONDS,
        )
        return result

    def find_isstracker_photo(
        self,
        norad: int,
        name: str = "",
    ) -> SatellitePhoto | None:
        norad = int(norad)
        cache_key = f"satellite-photo:isstracker:{norad}"
        cached = self._cache.get_json(cache_key)
        if isinstance(cached, dict) and "found" in cached:
            value = cached.get("value")
            if isinstance(value, dict):
                return SatellitePhoto(
                    image_url=_clean(value.get("image_url")),
                    source_url=_clean(value.get("source_url")),
                    credit=_clean(value.get("credit")) or "ISS Tracker",
                    license_name=_clean(value.get("license")) or "See ISS Tracker source for image usage terms",
                    match=_clean(value.get("match")) or "isstracker",
                )
            return None

        page_url = self.ISSTRACKER_PAGE_URL.format(norad=norad)
        try:
            with httpx.Client(
                timeout=10.0,
                follow_redirects=True,
                headers={
                    "User-Agent": "ALEN/0.1 (satellite photo lookup)",
                    "Accept": "text/html,application/xhtml+xml",
                },
            ) as client:
                response = client.get(page_url)
                response.raise_for_status()
                html = response.text
        except httpx.HTTPError:
            self._cache.set_json(
                cache_key,
                {"found": False, "value": None},
                ttl_seconds=1800,
            )
            return None

        image_url = _extract_isstracker_photo_url(html)
        if not image_url:
            self._cache.set_json(
                cache_key,
                {"found": False, "value": None},
                ttl_seconds=3600,
            )
            return None

        photo = SatellitePhoto(
            image_url=image_url,
            source_url=page_url,
            credit="ISS Tracker",
            license_name="See ISS Tracker source for image usage terms",
            match="isstracker",
        )
        self._cache.set_json(
            cache_key,
            {
                "found": True,
                "value": {
                    "image_url": photo.image_url,
                    "source_url": photo.source_url,
                    "credit": photo.credit,
                    "license": photo.license_name,
                    "match": photo.match,
                    "name": name,
                },
            },
            ttl_seconds=self.CACHE_TTL_SECONDS,
        )
        return photo

    def image_bytes(
        self,
        photo: dict[str, object],
    ) -> tuple[bytes, str] | None:
        image_url = _clean(photo.get("image_url"))
        if not _trusted_satellite_image_url(image_url):
            return None

        try:
            with httpx.Client(
                timeout=20.0,
                follow_redirects=True,
                headers={
                    "User-Agent": "ALEN/0.1 (satellite photo proxy)",
                    "Accept": "image/avif,image/webp,image/png,image/jpeg,image/*",
                },
            ) as client:
                response = client.get(image_url)
                response.raise_for_status()
                mime = (
                    response.headers.get("content-type", "")
                    .split(";", 1)[0]
                    .lower()
                )
                body = response.content
        except httpx.HTTPError:
            return None

        if mime not in {
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/avif",
        }:
            return None
        if not body or len(body) > self.MAX_IMAGE_BYTES:
            return None
        return body, mime

    def _satcat(self, norad: int) -> dict[str, object] | None:
        try:
            with httpx.Client(timeout=10.0, follow_redirects=True, headers={"User-Agent": "ALEN/0.1", "Accept": "application/json"}) as client:
                response = client.get(self.SATCAT_URL, params={"CATNR": str(norad), "FORMAT": "JSON"})
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError):
            return None
        if isinstance(payload, list) and payload and isinstance(payload[0], dict):
            return payload[0]
        if isinstance(payload, dict):
            return payload
        return None

    def _satnogs(self, norad: int) -> dict[str, object] | None:
        try:
            with httpx.Client(timeout=10.0, follow_redirects=True, headers={"User-Agent": "ALEN/0.1", "Accept": "application/json"}) as client:
                response = client.get(self.SATNOGS_URL, params={"format": "json", "norad_cat_id": str(norad)})
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError):
            return None
        if isinstance(payload, list):
            for item in payload:
                if isinstance(item, dict) and int(item.get("norad_cat_id") or 0) == norad:
                    return item
        if isinstance(payload, dict) and int(payload.get("norad_cat_id") or 0) == norad:
            return payload
        return None

    def _satnogs_photo(self, satnogs: dict[str, object] | None) -> SatellitePhoto | None:
        if not satnogs:
            return None
        raw = _clean(satnogs.get("image"))
        if not raw:
            return None
        image_url = raw if raw.startswith("https://") else self.SATNOGS_MEDIA_BASE + raw.lstrip("/")
        if not image_url.startswith(self.SATNOGS_MEDIA_BASE):
            return None
        norad = satnogs.get("norad_cat_id")
        return SatellitePhoto(
            image_url=image_url,
            source_url=f"https://db.satnogs.org/satellite/{norad}/",
            credit="SatNOGS DB",
            license_name="See SatNOGS source",
            match="satnogs",
        )

    def _commons_photo(self, name: str, object_type_code: str) -> SatellitePhoto | None:
        cleaned = re.sub(r"\b(?:R/B(?:\(\d\))?|DEB|PAYLOAD)\b", "", name, flags=re.I).strip(" -/")
        suffix = "rocket" if object_type_code == "R/B" else "satellite"
        for query in (f'"{name}" {suffix}', f'"{cleaned}" {suffix}'):
            photo = self._commons_search(query)
            if photo is not None:
                return photo
        return None

    def _commons_search(self, query: str) -> SatellitePhoto | None:
        params = {
            "action": "query",
            "generator": "search",
            "gsrsearch": query,
            "gsrnamespace": "6",
            "gsrlimit": "8",
            "prop": "imageinfo",
            "iiprop": "url|mime|extmetadata",
            "iiurlwidth": "900",
            "format": "json",
            "formatversion": "2",
        }
        try:
            with httpx.Client(timeout=15.0, follow_redirects=True, headers={"User-Agent": "ALEN/0.1 (satellite photo lookup)", "Accept": "application/json"}) as client:
                response = client.get(self.COMMONS_API_URL, params=params)
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError):
            return None
        pages = payload.get("query", {}).get("pages", []) if isinstance(payload, dict) else []
        if not isinstance(pages, list):
            return None
        for page in pages:
            if not isinstance(page, dict):
                continue
            infos = page.get("imageinfo")
            if not isinstance(infos, list) or not infos or not isinstance(infos[0], dict):
                continue
            info = infos[0]
            if str(info.get("mime") or "") not in {"image/jpeg", "image/png", "image/webp"}:
                continue
            image_url = _clean(info.get("thumburl") or info.get("url"))
            source_url = _clean(info.get("descriptionurl"))
            if not image_url.startswith("https://upload.wikimedia.org/") or not source_url.startswith("https://commons.wikimedia.org/"):
                continue
            metadata = info.get("extmetadata") if isinstance(info.get("extmetadata"), dict) else {}
            return SatellitePhoto(
                image_url=image_url,
                source_url=source_url,
                credit=_metadata_text(metadata, "Artist") or "Wikimedia Commons contributor",
                license_name=_metadata_text(metadata, "LicenseShortName") or "See source for licence",
                match="commons",
            )
        return None


class _ISSTrackerImageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.candidates: list[tuple[str, str]] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        if tag.lower() != "img":
            return
        values = {key.lower(): (value or "") for key, value in attrs}
        alt = values.get("alt", "")
        for key in ("src", "data-src", "data-lazy-src"):
            url = values.get(key, "").strip()
            if url:
                self.candidates.append((alt, url))
        srcset = values.get("srcset", "").strip()
        if srcset:
            first = srcset.split(",", 1)[0].strip().split(" ", 1)[0]
            if first:
                self.candidates.append((alt, first))


def _extract_isstracker_photo_url(html: str) -> str:
    parser = _ISSTrackerImageParser()
    try:
        parser.feed(html)
    except Exception:
        parser.candidates = []

    ranked: list[tuple[int, str]] = []
    for alt, raw_url in parser.candidates:
        url = unescape(raw_url).strip()
        if not _trusted_isstracker_image_url(url):
            continue
        lower_alt = alt.lower()
        lower_url = url.lower()
        score = 0
        if "photo" in lower_alt:
            score += 100
        if "satellite" in lower_alt:
            score += 30
        if "img-cdn.isstracker.pl" in lower_url:
            score += 40
        if "/images/satellites/" in lower_url or "/static/cache/" in lower_url:
            score += 25
        if "orbit" in lower_alt or "launch" in lower_alt:
            score -= 70
        if "status-" in lower_url or "banner" in lower_url or "/img/" in lower_url:
            score -= 80
        ranked.append((score, url))

    if not ranked:
        for url in re.findall(
            r"https://(?:img-cdn\.isstracker\.pl|static\.isstracker\.pl)/[^\"'<>\s]+",
            html,
            flags=re.I,
        ):
            clean_url = unescape(url).strip()
            lower_url = clean_url.lower()
            if not _trusted_isstracker_image_url(clean_url):
                continue
            score = 40 if "img-cdn.isstracker.pl" in lower_url else 0
            if "/images/satellites/" in lower_url or "/static/cache/" in lower_url:
                score += 25
            if "status-" in lower_url or "banner" in lower_url:
                score -= 80
            ranked.append((score, clean_url))

    if not ranked:
        return ""
    ranked.sort(key=lambda item: item[0], reverse=True)
    return ranked[0][1] if ranked[0][0] > 0 else ""


def _trusted_isstracker_image_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
    except ValueError:
        return False
    return (
        parsed.scheme == "https"
        and (parsed.hostname or "").lower()
        in {"img-cdn.isstracker.pl", "static.isstracker.pl"}
    )


def _purpose_for(object_type_code: str, name: str) -> str:
    if object_type_code == "R/B" or " R/B" in name.upper():
        return "Spent launch-vehicle stage. Its job was to help place the mission payload into orbit; it is now an uncontrolled rocket body rather than an operating satellite."
    if object_type_code == "DEB" or " DEB" in name.upper():
        return "Orbital debris or a fragment from a launch/spacecraft. It has no active mission."
    if object_type_code == "PAY":
        return "Spacecraft payload. A detailed public mission description was not available from the current metadata sources."
    return "Artificial object in orbit. A detailed public mission description was not available from the current metadata sources."


def _life_expectancy(description: str, object_type_code: str) -> str:
    if object_type_code in {"R/B", "DEB"}:
        return "Not applicable — this is not an active spacecraft; it remains in orbit until natural decay/re-entry."
    match = re.search(r"mission duration of\s+([^.,;]+)", description, flags=re.I)
    if match:
        return match.group(1).strip()
    return "Not publicly specified in the available catalog data"


def _cost_text(object_type_code: str) -> str:
    if object_type_code == "R/B":
        return "Not separately published — this is a spent stage from the overall launch vehicle"
    if object_type_code == "DEB":
        return "Not applicable as a standalone mission cost"
    return "Not publicly specified in the available catalog data"


def _country_text(value: object) -> str:
    if isinstance(value, list):
        return ", ".join(str(item) for item in value if item) or "Not publicly listed"
    return _clean(value) or "Not publicly listed"


def _clean(value: object) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _number(value: object) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def _https_url(value: object) -> str:
    text = _clean(value)
    return text if text.startswith("https://") else ""


def _metadata_text(metadata: dict[str, object], key: str) -> str:
    raw = metadata.get(key)
    if not isinstance(raw, dict):
        return ""
    value = str(raw.get("value") or "")
    value = re.sub(r"<[^>]*>", "", value)
    return unescape(value).strip()


def _trusted_satellite_image_url(value: str) -> bool:
    if _trusted_isstracker_image_url(value):
        return True
    try:
        parsed = urlparse(value)
    except ValueError:
        return False
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https":
        return False
    return (
        host == "upload.wikimedia.org"
        or (
            host == "db-satnogs.freetls.fastly.net"
            and parsed.path.startswith("/media/")
        )
    )
