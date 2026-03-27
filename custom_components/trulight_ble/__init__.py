"""TruLight BLE integration for Home Assistant.

Controls TruLight Pro addressable LED controllers via ESPHome BLE proxy.
The ESP32 proxy handles BLE communication; this integration sends hex commands
through ESPHome text and button entities.
"""

from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.BUTTON, Platform.LIGHT, Platform.SELECT]

CARD_JS = "trulight-scene-builder.js"
CARD_URL = f"/local/community/{DOMAIN}/{CARD_JS}"


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the TruLight BLE component — register frontend card and services."""
    # Copy the card JS to www/community/trulight_ble/ so HA can serve it
    await hass.async_add_executor_job(_install_card, hass.config.path("www"))
    add_extra_js_url(hass, CARD_URL)

    async def _handle_apply_scene(call):
        """Apply the currently staged scene (zone + category + scene)."""
        # Find the right entry — use entity_id if provided, otherwise first entry
        for entry_id, data in hass.data.get(DOMAIN, {}).items():
            scene_select = data.get("scene_select")
            if scene_select is not None:
                await scene_select.async_reapply()
                return

    hass.services.async_register(DOMAIN, "apply_scene", _handle_apply_scene)

    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up TruLight BLE from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    # Load scene commands from bundled JSON + user scenes from config dir
    scene_data = await hass.async_add_executor_job(
        _load_scene_commands, hass.config.path()
    )
    hass.data[DOMAIN][entry.entry_id] = {
        "scene_commands": scene_data,
    }

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a TruLight BLE config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
    return unload_ok


def _install_card(www_path: str) -> None:
    """Copy the custom card JS to the HA www directory."""
    src = Path(__file__).parent / "www" / CARD_JS
    dest_dir = Path(www_path) / "community" / DOMAIN
    dest = dest_dir / CARD_JS

    if not src.exists():
        _LOGGER.warning("Card JS not found at %s", src)
        return

    dest_dir.mkdir(parents=True, exist_ok=True)

    # Only copy if source is newer or dest doesn't exist
    if not dest.exists() or src.stat().st_mtime > dest.stat().st_mtime:
        shutil.copy2(src, dest)
        _LOGGER.info("Installed %s to %s", CARD_JS, dest)


def _load_scene_commands(config_path: str) -> dict:
    """Load scene commands from the bundled JSON file + user scenes."""
    path = Path(__file__).parent / "data" / "scene_commands.json"
    user_path = Path(config_path) / DOMAIN / "user_scenes.json"
    try:
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
        if "flat" in raw:
            result = raw
        else:
            result = {"flat": raw, "groups": {}}
    except (FileNotFoundError, json.JSONDecodeError):
        _LOGGER.error("Failed to load scene_commands.json from %s", path)
        result = {"flat": {}, "groups": {}}

    # Load user scenes from HA config dir (survives integration updates)
    try:
        with open(user_path, encoding="utf-8") as f:
            user_scenes = json.load(f)
        if user_scenes:
            result["flat"]["User Built"] = user_scenes
            _LOGGER.info("Loaded %d user-built scenes from %s", len(user_scenes), user_path)
    except FileNotFoundError:
        pass
    except json.JSONDecodeError:
        _LOGGER.error("Failed to parse user scenes at %s", user_path)

    return result
