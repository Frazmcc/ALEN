from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from html import unescape
import re
import time
from urllib.parse import quote, urlparse

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
    provider: str = "wikimedia"


class AircraftPhotoProvider:
    COMMONS_API_URL = "https://commons.wikimedia.org/w/api.php"
    PLANESPOTTERS_API_BASE = "https://api.planespotters.net/pub/photos"
    CACHE_TTL_SECONDS = 86400
    MAX_METADATA_CACHE_ENTRIES = 512
    MAX_IMAGE_BYTES = 4 * 1024 * 1024

    def __init__(self) -> None:
        self._cache: OrderedDict[str, tuple[float, AircraftPhoto | None]] = OrderedDict()

    def find(
        self,
        registration: str,
        aircraft_type: str = "",
        icao_hex: str = "",
    ) -> AircraftPhoto | None:
        reg = _clean_registration(registration)
        type_name = aircraft_type.strip().upper()
        hex_code = _clean_hex(icao_hex)
        key = f"{hex_code}|{reg}|{type_name}"
        cached = self._cache.get(key)
        now = time.monotonic()
        if cached and now - cached[0] < self.CACHE_TTL_SECONDS:
            self._cache.move_to_end(key)
            return cached[1]
        if cached:
            self._cache.pop(key, None)

        photo = None
        if hex_code:
            photo = self._search_planespotters("hex", hex_code, reg, "icao")
        if photo is None and reg:
            photo = self._search_planespotters("reg", reg, reg, "registration")

        if photo is None and reg:
            photo = self._search_registration_category(reg)
        if photo is None and reg:
            photo = self._search_commons(
                f'"{reg}" aircraft',
                exact_token=reg,
                match="registration",
            )
        if photo is not None and not photo.planespotters_url:
            gallery = (
                f"https://www.planespotters.net/photos/reg/{quote(reg, safe='')}"
                if reg
                else "https://www.planespotters.net/photos"
            )
            photo = AircraftPhoto(
                image_url=photo.image_url,
                source_url=photo.source_url,
                title=photo.title,
                artist=photo.artist,
                license_name=photo.license_name,
                match=photo.match,
                planespotters_url=gallery,
                provider=photo.provider,
            )

        self._cache[key] = (now, photo)
        self._cache.move_to_end(key)
        self._prune_metadata_cache(now)
        return photo

    def find_regional_service(
        self,
        service: str,
        region: str,
        aircraft_type: str = "",
        operator: str = "",
    ) -> AircraftPhoto | None:
        service_key = re.sub(r"[^a-z_]", "", service.lower())
        service_labels = {
            "police": "police aviation",
            "air_ambulance": "air ambulance",
            "coastguard": "coastguard rescue",
        }
        label = service_labels.get(service_key)
        region_name = region.strip()[:80]
        operator_name = operator.strip()[:120]
        type_name = aircraft_type.strip().upper()[:16]
        if not label or not region_name:
            return None

        key = f"regional|{service_key}|{region_name.upper()}|{operator_name.upper()}|{type_name}"
        cached = self._cache.get(key)
        now = time.monotonic()
        if cached and now - cached[0] < self.CACHE_TTL_SECONDS:
            self._cache.move_to_end(key)
            return cached[1]
        if cached:
            self._cache.pop(key, None)

        model_terms = _type_search_queries(type_name) if type_name else ()
        model_name = model_terms[0].removesuffix(" aircraft") if model_terms else type_name
        queries: list[str] = []
        if operator_name:
            queries.append(f'"{region_name}" "{operator_name}" aircraft')
        if model_name:
            queries.append(f'"{region_name}" "{label}" "{model_name}"')
        queries.append(f'"{region_name}" "{label}" aircraft')

        photo = None
        for query in queries:
            photo = self._search_commons(
                query,
                exact_token="",
                match="regional_service",
            )
            if photo is not None:
                break

        self._cache[key] = (now, photo)
        self._cache.move_to_end(key)
        self._prune_metadata_cache(now)
        return photo

    def image_bytes(self, photo: AircraftPhoto) -> tuple[bytes, str] | None:
        if not _trusted_image_url(photo.image_url):
            return None
        try:
            with httpx.Client(
                timeout=20.0,
                follow_redirects=True,
                headers={
                    "User-Agent": "ALEN/0.1 (aircraft photo proxy)",
                    "Accept": "image/avif,image/webp,image/png,image/jpeg,image/*",
                    "Referer": "https://alen.observer/",
                },
            ) as client:
                response = client.get(photo.image_url)
                response.raise_for_status()
                mime = response.headers.get("content-type", "").split(";", 1)[0].lower()
                body = response.content
        except httpx.HTTPError:
            return None

        if mime not in {"image/jpeg", "image/png", "image/webp", "image/avif"}:
            return None
        if not body or len(body) > self.MAX_IMAGE_BYTES:
            return None
        # Do not retain image bytes in process memory. Browsers receive a
        # long Cache-Control lifetime from the API endpoint, while the server
        # releases the temporary response body immediately after this request.
        return body, mime

    def _prune_metadata_cache(self, now: float) -> None:
        expired = [
            key
            for key, (created_at, _) in self._cache.items()
            if now - created_at >= self.CACHE_TTL_SECONDS
        ]
        for key in expired:
            self._cache.pop(key, None)
        while len(self._cache) > self.MAX_METADATA_CACHE_ENTRIES:
            self._cache.popitem(last=False)

    def _search_planespotters(
        self,
        mode: str,
        value: str,
        registration: str,
        match: str,
    ) -> AircraftPhoto | None:
        if mode not in {"hex", "reg"}:
            return None
        url = f"{self.PLANESPOTTERS_API_BASE}/{mode}/{quote(value, safe='')}"
        try:
            with httpx.Client(
                timeout=12.0,
                follow_redirects=True,
                headers={
                    "User-Agent": "ALEN/0.1 (aircraft photo lookup)",
                    "Accept": "application/json",
                },
            ) as client:
                response = client.get(url)
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError):
            return None

        photos = payload.get("photos") if isinstance(payload, dict) else None
        if not isinstance(photos, list):
            return None
        for item in photos:
            if not isinstance(item, dict):
                continue
            thumbnail = item.get("thumbnail")
            if not isinstance(thumbnail, dict):
                continue
            image_url = str(thumbnail.get("src") or "").strip()
            source_url = _planespotters_source_url(item.get("link"), registration)
            if not _trusted_image_url(image_url) or not source_url:
                continue
            photographer = str(item.get("photographer") or "").strip()
            title = (
                f"{registration} aircraft"
                if registration
                else "Aircraft photo"
            )
            gallery = (
                f"https://www.planespotters.net/photos/reg/{quote(registration, safe='')}"
                if registration
                else "https://www.planespotters.net/photos"
            )
            return AircraftPhoto(
                image_url=image_url,
                source_url=source_url,
                title=title,
                artist=photographer or "Planespotters.net contributor",
                license_name="Planespotters.net — see source for photo usage terms",
                match=match,
                planespotters_url=gallery,
                provider="planespotters",
            )
        return None

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
        payload = self._commons_request(params)
        if payload is None:
            return None
        return self._photo_from_pages(
            payload.get("query", {}).get("pages", []),
            exact_token="",
            match="registration",
        )

    def _search_commons(
        self,
        query: str,
        *,
        exact_token: str,
        match: str,
    ) -> AircraftPhoto | None:
        params = {
            "action": "query",
            "generator": "search",
            "gsrsearch": query,
            "gsrnamespace": "6",
            "gsrlimit": "12",
            "prop": "imageinfo",
            "iiprop": "url|mime|extmetadata",
            "iiurlwidth": "900",
            "format": "json",
            "formatversion": "2",
        }
        payload = self._commons_request(params)
        if payload is None:
            return None
        pages = payload.get("query", {}).get("pages", [])
        return self._photo_from_pages(pages, exact_token=exact_token, match=match)

    def _commons_request(self, params: dict[str, object]) -> dict[str, object] | None:
        try:
            with httpx.Client(
                timeout=15.0,
                follow_redirects=True,
                headers={
                    "User-Agent": "ALEN/0.1 (aircraft photo lookup)",
                    "Accept": "application/json",
                },
            ) as client:
                response = client.get(self.COMMONS_API_URL, params=params)
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError):
            return None
        return payload if isinstance(payload, dict) else None

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
            if not _trusted_image_url(image_url):
                continue
            if not _is_exact_host(source_url, "commons.wikimedia.org"):
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
                provider="wikimedia",
            )
        return None


def _clean_registration(value: str) -> str:
    reg = value.strip().upper()
    if reg in {"", "—", "N/A", "UNKNOWN"}:
        return ""
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9-]{1,14}", reg):
        return ""
    return reg


def _clean_hex(value: str) -> str:
    code = re.sub(r"[^0-9A-F]", "", value.upper())
    return code if re.fullmatch(r"[0-9A-F]{6}", code) else ""


def _type_search_queries(type_name: str) -> tuple[str, ...]:
    aliases = {
        "B38M": ("Boeing 737 MAX 8 aircraft", "Boeing 737-8-200 aircraft"),
        "B39M": ("Boeing 737 MAX 9 aircraft",),
        "A20N": ("Airbus A320neo aircraft",),
        "A21N": ("Airbus A321neo aircraft",),
        "A19N": ("Airbus A319neo aircraft",),
    }
    return aliases.get(type_name, (f'"{type_name}" aircraft',))


def _planespotters_source_url(value: object, registration: str) -> str:
    text = str(value or "").strip()
    if text.startswith("/"):
        text = "https://www.planespotters.net" + text
    if _is_host_or_subdomain(text, "planespotters.net"):
        return text
    if registration:
        return f"https://www.planespotters.net/photos/reg/{quote(registration, safe='')}"
    return "https://www.planespotters.net/photos"


def _trusted_image_url(value: str) -> bool:
    if _is_exact_host(value, "upload.wikimedia.org"):
        return True
    if _is_host_or_subdomain(value, "plnspttrs.net"):
        return True
    if _is_host_or_subdomain(value, "planespotters.net"):
        return True
    return False


def _is_exact_host(value: object, host: str) -> bool:
    try:
        parsed = urlparse(str(value or ""))
    except ValueError:
        return False
    return parsed.scheme == "https" and (parsed.hostname or "").lower() == host.lower()


def _is_host_or_subdomain(value: object, host: str) -> bool:
    try:
        parsed = urlparse(str(value or ""))
    except ValueError:
        return False
    hostname = (parsed.hostname or "").lower()
    root = host.lower()
    return parsed.scheme == "https" and (hostname == root or hostname.endswith("." + root))


def _normalize(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", value.upper())


def _metadata_text(metadata: dict[str, object], key: str) -> str:
    raw = metadata.get(key)
    if not isinstance(raw, dict):
        return ""
    value = str(raw.get("value") or "")
    value = re.sub(r"<[^>]*>", "", value)
    return unescape(value).strip()
