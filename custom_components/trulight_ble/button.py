"""Button platform for TruLight BLE integration.

Provides an "Apply Scene" button that sends the currently staged scene
(zone + category + scene selects) to the light.
"""

from __future__ import annotations

import logging

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_NAME
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up TruLight BLE button entities from a config entry."""
    async_add_entities([TruLightApplySceneButton(hass, entry)])


class TruLightApplySceneButton(ButtonEntity):
    """Button that applies the currently staged scene."""

    _attr_has_entity_name = True
    _attr_icon = "mdi:play"

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self._entry = entry

        base_name = entry.data[CONF_NAME]
        self._attr_unique_id = f"trulight_{entry.entry_id}_apply_scene"
        self._attr_name = f"{base_name} Apply Scene"

    async def async_press(self) -> None:
        """Apply the currently staged scene."""
        data = self.hass.data.get(DOMAIN, {}).get(self._entry.entry_id)
        if data is None:
            _LOGGER.warning("No data found for entry %s", self._entry.entry_id)
            return

        scene_select = data.get("scene_select")
        if scene_select is None:
            _LOGGER.warning("Scene select entity not found")
            return

        await scene_select.async_reapply()
