"""Select platform for TruLight BLE integration.

Provides three linked select entities for browsing built-in scenes:
- TruLightZoneSelect: picks which zone to target (All Zones, Top Roofline, etc.)
- TruLightCategorySelect: picks a scene category (e.g., "Christmas 1", "Halloween")
- TruLightSceneSelect: picks a scene within the selected category and sends it to the light
"""

from __future__ import annotations

import logging

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_NAME
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import CONF_COMMAND_ENTITY, CONF_POWER_ON_ENTITY, CONF_ZONES, DOMAIN

_LOGGER = logging.getLogger(__name__)

_PLACEHOLDER = "Select a category"
_ALL_ZONES = "All Zones"


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up TruLight BLE select entities from a config entry."""
    data = hass.data[DOMAIN][entry.entry_id]
    scene_data = data["scene_commands"]
    flat_scenes: dict = scene_data.get("flat", scene_data)

    zone_entity = TruLightZoneSelect(hass, entry)
    category_entity = TruLightCategorySelect(hass, entry, flat_scenes)
    scene_entity = TruLightSceneSelect(hass, entry, flat_scenes)

    # Store references so entities can communicate.
    data["zone_select"] = zone_entity
    data["category_select"] = category_entity
    data["scene_select"] = scene_entity

    async_add_entities([zone_entity, category_entity, scene_entity])


class TruLightZoneSelect(SelectEntity):
    """Select entity for choosing which zone to target."""

    _attr_has_entity_name = True
    _attr_icon = "mdi:select-group"

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
    ) -> None:
        self.hass = hass
        self._entry = entry

        base_name = entry.data[CONF_NAME]
        self._attr_unique_id = f"trulight_{entry.entry_id}_zone"
        self._attr_name = f"{base_name} Zone"

        # Build zone options from config
        options = [_ALL_ZONES]
        self._zone_map: dict[str, int] = {_ALL_ZONES: 0}
        for zone in entry.data.get(CONF_ZONES, []):
            options.append(zone["name"])
            self._zone_map[zone["name"]] = zone["id"]

        self._attr_options = options
        self._attr_current_option = _ALL_ZONES

    @property
    def selected_zone_id(self) -> int:
        """Return the currently selected zone ID (0 = all)."""
        return self._zone_map.get(self._attr_current_option, 0)

    async def async_select_option(self, option: str) -> None:
        """Handle zone selection."""
        self._attr_current_option = option
        self.async_write_ha_state()


class TruLightCategorySelect(SelectEntity):
    """Select entity for choosing a scene category."""

    _attr_has_entity_name = True
    _attr_icon = "mdi:folder-star"

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        flat_scenes: dict,
    ) -> None:
        self.hass = hass
        self._entry = entry
        self._flat_scenes = flat_scenes

        base_name = entry.data[CONF_NAME]
        self._attr_unique_id = f"trulight_{entry.entry_id}_category"
        self._attr_name = f"{base_name} Category"
        self._attr_options = sorted(flat_scenes.keys())
        self._attr_current_option = None

    async def async_select_option(self, option: str) -> None:
        """Handle category selection — update the companion scene select."""
        self._attr_current_option = option
        self.async_write_ha_state()

        # Push the new scene list to the companion scene select entity.
        scene_select: TruLightSceneSelect | None = (
            self.hass.data[DOMAIN][self._entry.entry_id].get("scene_select")
        )
        if scene_select is not None:
            scene_select.update_scenes_for_category(option)


class TruLightSceneSelect(SelectEntity):
    """Select entity for choosing and activating a scene."""

    _attr_has_entity_name = True
    _attr_icon = "mdi:lightbulb-group"

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        flat_scenes: dict,
    ) -> None:
        self.hass = hass
        self._entry = entry
        self._flat_scenes = flat_scenes

        # Build a quick lookup: {category: {scene_name: hex_cmd}}
        self._scene_lookup: dict[str, dict[str, str]] = {}
        for category, scenes in flat_scenes.items():
            self._scene_lookup[category] = {
                s["name"]: s["hex"] for s in scenes
            }

        base_name = entry.data[CONF_NAME]
        self._attr_unique_id = f"trulight_{entry.entry_id}_scene"
        self._attr_name = f"{base_name} Scene"
        self._attr_options: list[str] = [_PLACEHOLDER]
        self._attr_current_option = _PLACEHOLDER

        self._current_category: str | None = None
        self._command_entity: str = entry.data[CONF_COMMAND_ENTITY]
        self._power_on_entity: str = entry.data[CONF_POWER_ON_ENTITY]

    def update_scenes_for_category(self, category: str) -> None:
        """Replace the option list with scene names from the given category."""
        self._current_category = category
        scenes = self._scene_lookup.get(category, {})
        self._attr_options = sorted(scenes.keys()) if scenes else [_PLACEHOLDER]
        self._attr_current_option = None
        self.async_write_ha_state()

    async def async_select_option(self, option: str) -> None:
        """Handle scene selection — power on and send the hex command."""
        if option == _PLACEHOLDER or self._current_category is None:
            return

        hex_cmd = self._scene_lookup.get(self._current_category, {}).get(option)
        if hex_cmd is None:
            _LOGGER.warning(
                "Scene '%s' not found in category '%s'",
                option,
                self._current_category,
            )
            return

        self._attr_current_option = option
        self.async_write_ha_state()

        await self._apply_scene(hex_cmd)

    async def _apply_scene(self, hex_cmd: str) -> None:
        """Power on and send the hex command, patching zone byte if needed."""
        # Read the selected zone from the companion zone select
        zone_select: TruLightZoneSelect | None = (
            self.hass.data[DOMAIN][self._entry.entry_id].get("zone_select")
        )
        zone_id = zone_select.selected_zone_id if zone_select else 0

        # Patch zone byte in F7 command: byte 2 (hex chars 4-5)
        if zone_id > 0 and hex_cmd.upper().startswith("AAF7"):
            hex_cmd = hex_cmd[:4] + f"{zone_id:02X}" + hex_cmd[6:]

        # Ensure the light is powered on before sending the scene command.
        await self.hass.services.async_call(
            "button",
            "press",
            {"entity_id": self._power_on_entity},
        )

        await self.hass.services.async_call(
            "text",
            "set_value",
            {"entity_id": self._command_entity, "value": hex_cmd},
        )

        _LOGGER.debug(
            "Sent scene '%s' (category '%s', zone %d) via %s",
            self._attr_current_option,
            self._current_category,
            zone_id,
            self._command_entity,
        )

    async def async_reapply(self) -> None:
        """Re-apply the currently selected scene (for APPLY button service)."""
        if self._attr_current_option == _PLACEHOLDER or self._current_category is None:
            return
        hex_cmd = self._scene_lookup.get(self._current_category, {}).get(
            self._attr_current_option
        )
        if hex_cmd:
            await self._apply_scene(hex_cmd)
