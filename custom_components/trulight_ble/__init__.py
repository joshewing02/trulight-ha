"""TruLight BLE integration for Home Assistant.

Controls TruLight Pro addressable LED controllers via ESPHome BLE proxy.
The ESP32 proxy handles BLE communication; this integration sends hex commands
through ESPHome text and button entities.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.LIGHT]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up TruLight BLE from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    # Load scene commands from bundled JSON
    scene_data = await hass.async_add_executor_job(_load_scene_commands)
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


def _load_scene_commands() -> dict:
    """Load scene commands from the bundled JSON file."""
    path = Path(__file__).parent / "data" / "scene_commands.json"
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        _LOGGER.error("Failed to load scene_commands.json from %s", path)
        return {}
