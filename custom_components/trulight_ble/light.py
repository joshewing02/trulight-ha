"""Light platform for TruLight BLE integration.

Creates a main light entity plus separate entities for each configured zone
(e.g., Top Roofline, Bottom Roofline). Each zone can be controlled independently.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import voluptuous as vol

from homeassistant.components.light import (
    ATTR_BRIGHTNESS,
    ATTR_EFFECT,
    ATTR_RGB_COLOR,
    ColorMode,
    LightEntity,
    LightEntityFeature,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_NAME
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.entity_platform import (
    AddEntitiesCallback,
    async_get_current_platform,
)
from homeassistant.helpers.event import async_track_state_change_event

from .const import (
    CONF_COMMAND_ENTITY,
    CONF_POWER_OFF_ENTITY,
    CONF_POWER_ON_ENTITY,
    CONF_POWER_STATE_ENTITY,
    CONF_ZONES,
    DEFAULT_BRIGHTNESS,
    DEFAULT_DIRECTION,
    DEFAULT_PANEL_ID,
    DEFAULT_SPEED,
    DEFAULT_WIDTH,
    DEFAULT_ZONE,
    DOMAIN,
    EFFECTS,
)

_LOGGER = logging.getLogger(__name__)

# Curated effects for the UI - most useful ones organized by type
CURATED_EFFECTS = [
    # Solid & Simple
    "Static",
    "Breathing",
    "Fade",
    # Color Movement
    "Color Wipe",
    "Rainbow",
    "Rainbow Cycle",
    "Running Lights",
    "Chase Color",
    "Tricolor Chase",
    "Theater Chase",
    # Sparkle & Twinkle
    "Twinkle",
    "TwinkleFox",
    "Sparkle",
    "Solid Glitter",
    # Fire & Nature
    "Fire 2012",
    "Fire Flicker",
    "Aurora",
    "Pacifica",
    "Ocean",
    "Lake",
    # Dynamic
    "Meteor",
    "Meteor Smooth",
    "Lightning",
    "Fireworks",
    "Bouncing Balls",
    "Popcorn",
    # Scanner
    "Scan",
    "Dual Scan",
    "Larson Scanner",
    "Sinelon",
    # Music/Party
    "Strobe",
    "BPM",
    "Juggle",
    "Dissolve",
    # Flow
    "Flow",
    "Sweep",
    "Waves",
]

SERVICE_SET_SCENE = "set_scene"
SERVICE_SEND_RAW = "send_raw"
SERVICE_SET_LEDS = "set_leds"

ATTR_CATEGORY = "category"
ATTR_SCENE_NAME = "scene_name"
ATTR_ZONE = "zone"
ATTR_START_LED = "start_led"
ATTR_LEDS = "leds"
ATTR_HEX = "hex"


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up TruLight BLE light entities from a config entry."""
    scene_data = hass.data[DOMAIN][entry.entry_id]["scene_commands"]
    flat_scenes = scene_data.get("flat", scene_data)

    entities: list[TruLightBLELight] = []

    # Main entity (all zones)
    entities.append(
        TruLightBLELight(
            entry=entry,
            scene_commands=flat_scenes,
            zone_id=0,
            zone_name=None,
        )
    )

    # Per-zone entities
    zones = entry.data.get(CONF_ZONES, [])
    for zone in zones:
        entities.append(
            TruLightBLELight(
                entry=entry,
                scene_commands=flat_scenes,
                zone_id=zone["id"],
                zone_name=zone["name"],
            )
        )

    async_add_entities(entities)

    # Register services
    platform = async_get_current_platform()

    platform.async_register_entity_service(
        SERVICE_SET_SCENE,
        {
            vol.Required(ATTR_CATEGORY): cv.string,
            vol.Required(ATTR_SCENE_NAME): cv.string,
        },
        "async_set_scene",
    )

    platform.async_register_entity_service(
        SERVICE_SEND_RAW,
        {vol.Required(ATTR_HEX): cv.string},
        "async_send_raw",
    )

    platform.async_register_entity_service(
        SERVICE_SET_LEDS,
        {
            vol.Required(ATTR_START_LED): vol.Coerce(int),
            vol.Required(ATTR_LEDS): vol.All(list),
        },
        "async_set_leds",
    )


def build_scene_hex(
    zone: int = 0, model: int = 0, speed: int = DEFAULT_SPEED,
    width: int = DEFAULT_WIDTH, brightness: int = DEFAULT_BRIGHTNESS,
    direction: int = DEFAULT_DIRECTION,
    r1: int = 255, g1: int = 0, b1: int = 0,
    r2: int = 0, g2: int = 255, b2: int = 0,
    r3: int = 0, g3: int = 0, b3: int = 255,
) -> str:
    """Build F7 scene hex (no CRC — ESP32 adds it)."""
    data = [
        0xAA, 0xF7, zone & 0xFF, model & 0xFF,
        speed & 0xFF, width & 0xFF, brightness & 0xFF, direction & 0xFF,
        r1 & 0xFF, g1 & 0xFF, b1 & 0xFF, 0, 0,
        r2 & 0xFF, g2 & 0xFF, b2 & 0xFF, 0, 0,
        r3 & 0xFF, g3 & 0xFF, b3 & 0xFF, 0, 0,
        DEFAULT_PANEL_ID,
    ]
    data.extend([0] * 80)
    data.append(0)
    return "".join(f"{b:02X}" for b in data)


class TruLightBLELight(LightEntity):
    """A TruLight BLE light entity — either all zones or a specific zone."""

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(
        self, entry: ConfigEntry, scene_commands: dict,
        zone_id: int = 0, zone_name: str | None = None,
    ) -> None:
        """Initialize."""
        self._entry = entry
        self._scene_commands = scene_commands
        self._zone_id = zone_id

        base_name = entry.data[CONF_NAME]
        self._command_entity_id = entry.data[CONF_COMMAND_ENTITY]
        self._power_on_entity_id = entry.data[CONF_POWER_ON_ENTITY]
        self._power_off_entity_id = entry.data[CONF_POWER_OFF_ENTITY]
        self._power_state_entity_id = entry.data.get(CONF_POWER_STATE_ENTITY, "")

        if zone_name:
            self._attr_unique_id = f"trulight_{entry.entry_id}_zone{zone_id}"
            self._attr_name = f"{base_name} {zone_name}"
        else:
            self._attr_unique_id = f"trulight_{entry.entry_id}"
            self._attr_name = base_name

        self._is_on = False
        self._brightness = 255
        self._rgb_color = (255, 255, 255)
        self._effect = "Static"

    @property
    def supported_color_modes(self) -> set[ColorMode]:
        return {ColorMode.RGB}

    @property
    def color_mode(self) -> ColorMode:
        return ColorMode.RGB

    @property
    def supported_features(self) -> LightEntityFeature:
        return LightEntityFeature.EFFECT

    @property
    def is_on(self) -> bool:
        # Use real state from BLE polling if available
        if self._power_state_entity_id and self._zone_id == 0:
            state = self.hass.states.get(self._power_state_entity_id)
            if state is not None and state.state not in ("unavailable", "unknown"):
                return state.state == "on"
        return self._is_on

    @property
    def brightness(self) -> int | None:
        return self._brightness

    @property
    def rgb_color(self) -> tuple[int, int, int] | None:
        return self._rgb_color

    @property
    def effect(self) -> str | None:
        return self._effect

    @property
    def effect_list(self) -> list[str]:
        return CURATED_EFFECTS

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()

        @callback
        def _async_state_changed(event):
            self.async_write_ha_state()

        # Track command entity for availability
        tracked = [self._command_entity_id]
        # Track power state sensor for real state updates
        if self._power_state_entity_id:
            tracked.append(self._power_state_entity_id)

        self.async_on_remove(
            async_track_state_change_event(
                self.hass, tracked, _async_state_changed,
            )
        )

    @property
    def available(self) -> bool:
        state = self.hass.states.get(self._command_entity_id)
        return state is not None and state.state != "unavailable"

    async def async_turn_on(self, **kwargs: Any) -> None:
        """Turn on."""
        if not self._is_on:
            # Power on the whole controller (zone 0 controls master power)
            if self._zone_id == 0:
                await self._send_hex("AAF10100000000000000")
                await self.hass.services.async_call(
                    "button", "press",
                    {"entity_id": self._power_on_entity_id}, blocking=True,
                )
            else:
                # Zone power on: F6 zoneId 01
                await self._send_hex(
                    f"AAF6{self._zone_id:02X}01000000000000"
                )
            self._is_on = True

        if ATTR_BRIGHTNESS in kwargs:
            self._brightness = kwargs[ATTR_BRIGHTNESS]
            await self._send_hex(f"AAF2{self._brightness & 0xFF:02X}00000000000000")

        if ATTR_RGB_COLOR in kwargs:
            self._rgb_color = kwargs[ATTR_RGB_COLOR]

        effect = kwargs.get(ATTR_EFFECT)
        if effect and effect in EFFECTS:
            self._effect = effect

        if ATTR_RGB_COLOR in kwargs or ATTR_EFFECT in kwargs:
            model_id = EFFECTS.get(self._effect, 0)
            r, g, b = self._rgb_color
            await self._send_hex(build_scene_hex(
                zone=self._zone_id, model=model_id,
                brightness=self._brightness,
                r1=r, g1=g, b1=b, r2=r, g2=g, b2=b, r3=r, g3=g, b3=b,
            ))

        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs: Any) -> None:
        """Turn off."""
        if self._zone_id == 0:
            await self._send_hex("AAF10000000000000000")
            await self.hass.services.async_call(
                "button", "press",
                {"entity_id": self._power_off_entity_id}, blocking=True,
            )
        else:
            await self._send_hex(
                f"AAF6{self._zone_id:02X}00000000000000"
            )
        self._is_on = False
        self.async_write_ha_state()

    async def async_set_scene(self, category: str, scene_name: str) -> None:
        """Apply a pre-built scene."""
        scenes = self._scene_commands.get(category)
        if not scenes:
            _LOGGER.error("Category '%s' not found", category)
            return

        scene = next((s for s in scenes if s["name"] == scene_name), None)
        if not scene:
            _LOGGER.error("Scene '%s' not found in '%s'", scene_name, category)
            return

        if not self._is_on:
            await self.async_turn_on()

        hex_cmd = scene["hex"]
        # Override zone byte if this is a zone entity
        if self._zone_id > 0:
            hex_cmd = hex_cmd[:4] + f"{self._zone_id:02X}" + hex_cmd[6:]

        await self._send_hex(hex_cmd)
        self.async_write_ha_state()

    async def async_set_leds(self, start_led: int, leds: list[list[int]]) -> None:
        """Set specific LEDs to individual colors."""
        if not self._is_on:
            await self.async_turn_on()

        # Enter custom mode
        await self._send_hex("AAE0019000640064006400640000")
        await asyncio.sleep(0.3)

        # Send LED data in chunks
        MAX_PER_PACKET = 25
        for i in range(0, len(leds), MAX_PER_PACKET):
            chunk = leds[i:i + MAX_PER_PACKET]
            data = [0xAA, 0xE3, (start_led + i) >> 8, (start_led + i) & 0xFF, len(chunk)]
            for c in chunk:
                data.extend([0x00, c[0] & 0xFF, c[1] & 0xFF, c[2] & 0xFF, 0, 0])
            await self._send_hex("".join(f"{b:02X}" for b in data))
            if i + MAX_PER_PACKET < len(leds):
                await asyncio.sleep(0.1)

        await asyncio.sleep(0.2)
        await self._send_hex("AAA10000000000000000")

    async def async_send_raw(self, hex: str) -> None:
        """Send raw hex command."""
        await self._send_hex(hex)

    async def _send_hex(self, hex_string: str) -> None:
        """Send hex via ESPHome text entity."""
        await self.hass.services.async_call(
            "text", "set_value",
            {"entity_id": self._command_entity_id, "value": hex_string},
            blocking=True,
        )
