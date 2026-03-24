"""Light platform for TruLight BLE integration.

Wraps ESPHome text/button entities into a proper HA light entity with
effects, brightness, RGB color, and pre-built scene support.
"""

from __future__ import annotations

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
from homeassistant.const import CONF_NAME, STATE_ON
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
    DEFAULT_BRIGHTNESS,
    DEFAULT_DIRECTION,
    DEFAULT_PANEL_ID,
    DEFAULT_SPEED,
    DEFAULT_WIDTH,
    DEFAULT_ZONE,
    DOMAIN,
    EFFECTS,
    EFFECT_ID_TO_NAME,
)

_LOGGER = logging.getLogger(__name__)

SERVICE_SET_SCENE = "set_scene"
SERVICE_SEND_RAW = "send_raw"

ATTR_CATEGORY = "category"
ATTR_SCENE_NAME = "scene_name"
ATTR_SPEED = "speed"
ATTR_WIDTH = "width"
ATTR_DIRECTION = "direction"
ATTR_COLOR1 = "color1"
ATTR_COLOR2 = "color2"
ATTR_COLOR3 = "color3"
ATTR_HEX = "hex"


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up TruLight BLE light from a config entry."""
    scene_commands = hass.data[DOMAIN][entry.entry_id]["scene_commands"]

    entity = TruLightBLELight(
        entry=entry,
        scene_commands=scene_commands,
    )
    async_add_entities([entity])

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
        {
            vol.Required(ATTR_HEX): cv.string,
        },
        "async_send_raw",
    )


def build_scene_hex(
    zone: int = DEFAULT_ZONE,
    model: int = 0,
    speed: int = DEFAULT_SPEED,
    width: int = DEFAULT_WIDTH,
    brightness: int = DEFAULT_BRIGHTNESS,
    direction: int = DEFAULT_DIRECTION,
    r1: int = 255,
    g1: int = 0,
    b1: int = 0,
    r2: int = 0,
    g2: int = 255,
    b2: int = 0,
    r3: int = 0,
    g3: int = 0,
    b3: int = 255,
) -> str:
    """Build a scene (F7) hex command string.

    The ESP32 proxy appends CRC8-MAXIM automatically.
    """
    data = [
        0xAA,
        0xF7,
        zone & 0xFF,
        model & 0xFF,
        speed & 0xFF,
        width & 0xFF,
        brightness & 0xFF,
        direction & 0xFF,
        r1 & 0xFF, g1 & 0xFF, b1 & 0xFF, 0, 0,  # color1 RGBCW
        r2 & 0xFF, g2 & 0xFF, b2 & 0xFF, 0, 0,  # color2
        r3 & 0xFF, g3 & 0xFF, b3 & 0xFF, 0, 0,  # color3
        DEFAULT_PANEL_ID,  # panelId = -1 (0xFF)
    ]
    data.extend([0] * 80)  # palette (80 bytes)
    data.append(0)  # colorCount
    return "".join(f"{b:02X}" for b in data)


def build_brightness_hex(brightness: int) -> str:
    """Build a brightness (F2) hex command string."""
    return f"AAF2{brightness & 0xFF:02X}00000000000000"


class TruLightBLELight(LightEntity):
    """Representation of a TruLight BLE LED controller."""

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(
        self,
        entry: ConfigEntry,
        scene_commands: dict,
    ) -> None:
        """Initialize the TruLight BLE light."""
        self._entry = entry
        self._scene_commands = scene_commands

        self._name = entry.data[CONF_NAME]
        self._command_entity_id = entry.data[CONF_COMMAND_ENTITY]
        self._power_on_entity_id = entry.data[CONF_POWER_ON_ENTITY]
        self._power_off_entity_id = entry.data[CONF_POWER_OFF_ENTITY]

        self._attr_unique_id = f"trulight_{entry.entry_id}"
        self._attr_name = self._name

        self._is_on = False
        self._brightness = 255
        self._rgb_color = (255, 255, 255)
        self._effect = "Static"
        self._speed = DEFAULT_SPEED
        self._width = DEFAULT_WIDTH
        self._direction = DEFAULT_DIRECTION

    @property
    def supported_color_modes(self) -> set[ColorMode]:
        """Return the supported color modes."""
        return {ColorMode.RGB}

    @property
    def color_mode(self) -> ColorMode:
        """Return the current color mode."""
        return ColorMode.RGB

    @property
    def supported_features(self) -> LightEntityFeature:
        """Return the supported features."""
        return LightEntityFeature.EFFECT

    @property
    def is_on(self) -> bool:
        """Return true if the light is on."""
        return self._is_on

    @property
    def brightness(self) -> int | None:
        """Return the brightness (0-255)."""
        return self._brightness

    @property
    def rgb_color(self) -> tuple[int, int, int] | None:
        """Return the RGB color."""
        return self._rgb_color

    @property
    def effect(self) -> str | None:
        """Return the current effect."""
        return self._effect

    @property
    def effect_list(self) -> list[str]:
        """Return the list of supported effects."""
        return list(EFFECTS.keys())

    async def async_added_to_hass(self) -> None:
        """Run when entity is added to hass."""
        await super().async_added_to_hass()

        # Track ESPHome entity availability for state reporting
        @callback
        def _async_state_changed(event):
            """Handle tracked entity state changes."""
            self.async_write_ha_state()

        self.async_on_remove(
            async_track_state_change_event(
                self.hass,
                [self._command_entity_id],
                _async_state_changed,
            )
        )

    @property
    def available(self) -> bool:
        """Return True if the ESPHome proxy entities are available."""
        state = self.hass.states.get(self._command_entity_id)
        return state is not None and state.state != "unavailable"

    async def async_turn_on(self, **kwargs: Any) -> None:
        """Turn the light on."""
        if not self._is_on:
            await self._send_command_hex("AAF10100000000000000")
            # Also press the power on button
            await self.hass.services.async_call(
                "button",
                "press",
                {"entity_id": self._power_on_entity_id},
                blocking=True,
            )
            self._is_on = True

        # Handle brightness
        if ATTR_BRIGHTNESS in kwargs:
            self._brightness = kwargs[ATTR_BRIGHTNESS]
            await self._send_command_hex(build_brightness_hex(self._brightness))

        # Handle RGB color
        if ATTR_RGB_COLOR in kwargs:
            self._rgb_color = kwargs[ATTR_RGB_COLOR]

        # Handle effect
        effect = kwargs.get(ATTR_EFFECT)
        if effect and effect in EFFECTS:
            self._effect = effect

        # If color or effect changed, send a scene command
        if ATTR_RGB_COLOR in kwargs or ATTR_EFFECT in kwargs:
            model_id = EFFECTS.get(self._effect, 0)
            r, g, b = self._rgb_color
            hex_cmd = build_scene_hex(
                model=model_id,
                speed=self._speed,
                width=self._width,
                brightness=self._brightness,
                direction=self._direction,
                r1=r, g1=g, b1=b,
                r2=r, g2=g, b2=b,
                r3=r, g3=g, b3=b,
            )
            await self._send_command_hex(hex_cmd)

        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs: Any) -> None:
        """Turn the light off."""
        await self._send_command_hex("AAF10000000000000000")
        await self.hass.services.async_call(
            "button",
            "press",
            {"entity_id": self._power_off_entity_id},
            blocking=True,
        )
        self._is_on = False
        self.async_write_ha_state()

    async def async_set_scene(
        self,
        category: str,
        scene_name: str,
    ) -> None:
        """Apply a pre-built scene from scene_commands.json."""
        scenes_in_category = self._scene_commands.get(category)
        if not scenes_in_category:
            _LOGGER.error(
                "Scene category '%s' not found. Available: %s",
                category,
                list(self._scene_commands.keys()),
            )
            return

        scene = next(
            (s for s in scenes_in_category if s["name"] == scene_name),
            None,
        )
        if not scene:
            _LOGGER.error(
                "Scene '%s' not found in category '%s'. Available: %s",
                scene_name,
                category,
                [s["name"] for s in scenes_in_category],
            )
            return

        if not self._is_on:
            await self.async_turn_on()

        await self._send_command_hex(scene["hex"])
        self._is_on = True
        self.async_write_ha_state()

    async def async_send_raw(self, hex: str) -> None:
        """Send a raw hex command to the controller."""
        await self._send_command_hex(hex)

    async def _send_command_hex(self, hex_string: str) -> None:
        """Send a hex command string via the ESPHome text entity."""
        _LOGGER.debug("Sending command: %s to %s", hex_string, self._command_entity_id)
        await self.hass.services.async_call(
            "text",
            "set_value",
            {
                "entity_id": self._command_entity_id,
                "value": hex_string,
            },
            blocking=True,
        )
