from __future__ import annotations

from dataclasses import dataclass
from html import unescape
import re
import time
from urllib.parse import quote

import httpx


@dataclass(frozen=True)
class AircraftPhoto:
    image_url: str
    source_url: str
    title: str
    artist: str
    license_name: str
    match: str
    planespotters_url: str


class AircraftPhotoProvider:
    API_URL = "https://commons.wikimedia.org/w/api.php"
    CACHE_TTL_SECONDS = 21600

    def __init__(self) -> None:
        self._cache: dict[str, tuple[float, AircraftPhoto | None]] = {}

    def find(self, registration: str, aircraft_type: str = "") -> AircraftPhoto | None:
        reg = registration.strip().upper()
        type_name = aircraft_type.strip().upper()
        key = f"{reg}|{type_name}"
        cached = self._cache.get(key)
        now = time.monotonic()
        if cached and now - cached[0] < self.CACHE_TTL_SECONDS:
            return cached[1]

        photo = None
        if reg and reg != "—":
            photo = self._search_registration_category(reg)
        if photo is None and reg and reg != "—":
            photo = self._search(f'"{reg}" aircraft', exact_token=reg, match="registration")
        if photo is None and type_name and type_name not in {"AIRCRAFT", "—"}:
            photo = self._search(f'"{type_name}" aircraft', exact_token="", match="type")

        if photo is not None:
            planespotters_url = (
                f"https://www.planespotters.net/photos/reg/{quote(reg, safe='')}"
                if reg and reg != "—"
                else "https://www.planespotters.net/photos"
            )
            photo = AircraftPhoto(
                image_url=photo.image_url,
                source_url=photo.source_url,
                title=photo.title,
                artist=photo.artist,
                license_name=photo.license_name,
                match=photo.match,
                planespotters_url=planespotters_url,
            )

        self._cache[key] = (now, photo)
        return photo

    def _search_registration_category(self, registration: str) -> AircraftPhoto | None:
        params = {
            "action": "query",
            "generator": "categorymembers",
            "gcmtitle": f"Category:{registration} (aircraft)",
            "gcmtype": "file",
            "gcmlimit": "10",
            "prop": "imageinfo",
            "iiprop": "url|mime|extmetadata",
            "iiurlwidth": "900",
            "format": "json",
            "formatversion": "2",
        }
        try:
            with httpx.Client(
                timeout=20.0,
                follow_redirects=True,
                headers={
                    "User-Agent": "ALEN/0.1 (aircraft photo lookup)",
                    "Accept": "application/json",
                },
            ) as client:
                response = client.get(self.API_URL, params=params)
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError):
            return None

        return self._photo_from_pages(
            payload.get("query", {}).get("pages", []),
            exact_token="",
            match="registration",
        )

    def _search(self, query: str, *, exact_token: str, match: str) -> AircraftPhoto | None:
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
            with httpx.Client(
                timeout=20.0,
                follow_redirects=True,
                headers={
                    "User-Agent": "ALEN/0.1 (aircraft photo lookup)",
                    "Accept": "application/json",
                },
            ) as client:
                response = client.get(self.API_URL, params=params)
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError):
            return None

        pages = payload.get("query", {}).get("pages", [])
        return self._photo_from_pages(pages, exact_token=exact_token, match=match)

    def _photo_from_pages(
        self,
        pages: object,
        *,
        exact_token: str,
        match: str,
    ) -> AircraftPhoto | None:
        if not isinstance(pages, list):
            return None

        normalized_token = _normalize(exact_token)
        for page in pages:
            if not isinstance(page, dict):
                continue
            title = str(page.get("title") or "")
            if normalized_token and normalized_token not in _normalize(title):
                continue
            imageinfo = page.get("imageinfo")
            if not isinstance(imageinfo, list) or not imageinfo:
                continue
            info = imageinfo[0]
            if not isinstance(info, dict):
                continue
            mime = str(info.get("mime") or "")
            if mime not in {"image/jpeg", "image/png", "image/webp"}:
                continue
            image_url = str(info.get("thumburl") or info.get("url") or "")
            source_url = str(info.get("descriptionurl") or "")
            if not image_url or not source_url:
                continue
            metadata = info.get("extmetadata") if isinstance(info.get("extmetadata"), dict) else {}
            artist = _metadata_text(metadata, "Artist") or "Wikimedia Commons contributor"
            license_name = _metadata_text(metadata, "LicenseShortName") or "See source for licence"
            return AircraftPhoto(
                image_url=image_url,
                source_url=source_url,
                title=title.removeprefix("File:"),
                artist=artist,
                license_name=license_name,
                match=match,
                planespotters_url="",
            )
        return None


def _normalize(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", value.upper())


def _metadata_text(metadata: dict[str, object], key: str) -> str:
    raw = metadata.get(key)
    if not isinstance(raw, dict):
        return ""
    value = str(raw.get("value") or "")
    value = re.sub(r"<[^>]*>", "", value)
    return unescape(value).strip()
