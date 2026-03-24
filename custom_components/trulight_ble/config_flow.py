"""Config flow for TruLight BLE integration."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.const import CONF_NAME
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

from .const import (
    CONF_COMMAND_ENTITY,
    CONF_POWER_OFF_ENTITY,
    CONF_POWER_ON_ENTITY,
    CONF_ZONES,
    DOMAIN,
)

_LOGGER = logging.getLogger(__name__)

STEP_USER_DATA_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_NAME, default="TruLight"): str,
        vol.Required(CONF_COMMAND_ENTITY): str,
        vol.Required(CONF_POWER_ON_ENTITY): str,
        vol.Required(CONF_POWER_OFF_ENTITY): str,
    }
)

STEP_ZONES_SCHEMA = vol.Schema(
    {
        vol.Optional("zone_1_name", default=""): str,
        vol.Optional("zone_2_name", default=""): str,
        vol.Optional("zone_3_name", default=""): str,
        vol.Optional("zone_4_name", default=""): str,
    }
)


def _entity_exists(hass: HomeAssistant, entity_id: str) -> bool:
    """Check if an entity exists."""
    if hass.states.get(entity_id) is not None:
        return True
    registry = er.async_get(hass)
    return registry.async_get(entity_id) is not None


class TruLightBLEConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle a config flow for TruLight BLE."""

    VERSION = 2

    def __init__(self) -> None:
        """Initialize."""
        self._user_data: dict[str, Any] = {}

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Handle the initial step — ESPHome entity selection."""
        errors: dict[str, str] = {}

        if user_input is not None:
            command_entity = user_input[CONF_COMMAND_ENTITY]
            power_on_entity = user_input[CONF_POWER_ON_ENTITY]
            power_off_entity = user_input[CONF_POWER_OFF_ENTITY]

            if not _entity_exists(self.hass, command_entity):
                errors[CONF_COMMAND_ENTITY] = "entity_not_found"
            elif not command_entity.startswith("text."):
                errors[CONF_COMMAND_ENTITY] = "invalid_text_entity"

            if not _entity_exists(self.hass, power_on_entity):
                errors[CONF_POWER_ON_ENTITY] = "entity_not_found"
            elif not power_on_entity.startswith("button."):
                errors[CONF_POWER_ON_ENTITY] = "invalid_button_entity"

            if not _entity_exists(self.hass, power_off_entity):
                errors[CONF_POWER_OFF_ENTITY] = "entity_not_found"
            elif not power_off_entity.startswith("button."):
                errors[CONF_POWER_OFF_ENTITY] = "invalid_button_entity"

            if not errors:
                self._user_data = user_input
                return await self.async_step_zones()

        return self.async_show_form(
            step_id="user",
            data_schema=STEP_USER_DATA_SCHEMA,
            errors=errors,
        )

    async def async_step_zones(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Handle zone configuration step."""
        if user_input is not None:
            # Build zones list from non-empty names
            zones = []
            for i in range(1, 5):
                name = user_input.get(f"zone_{i}_name", "").strip()
                if name:
                    zones.append({"id": i, "name": name})

            self._user_data[CONF_ZONES] = zones

            await self.async_set_unique_id(
                f"trulight_{self._user_data[CONF_NAME].lower().replace(' ', '_')}"
            )
            self._abort_if_unique_id_configured()

            return self.async_create_entry(
                title=self._user_data[CONF_NAME],
                data=self._user_data,
            )

        return self.async_show_form(
            step_id="zones",
            data_schema=STEP_ZONES_SCHEMA,
            description_placeholders={
                "name": self._user_data.get(CONF_NAME, "TruLight"),
            },
        )
