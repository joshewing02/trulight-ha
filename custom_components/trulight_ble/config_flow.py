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


def _entity_exists(hass: HomeAssistant, entity_id: str) -> bool:
    """Check if an entity exists in the state machine or entity registry."""
    if hass.states.get(entity_id) is not None:
        return True
    registry = er.async_get(hass)
    return registry.async_get(entity_id) is not None


class TruLightBLEConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle a config flow for TruLight BLE."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Handle the initial step."""
        errors: dict[str, str] = {}

        if user_input is not None:
            # Validate that the specified entities exist
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
                # Use the name as a unique ID to prevent duplicates
                await self.async_set_unique_id(
                    f"trulight_{user_input[CONF_NAME].lower().replace(' ', '_')}"
                )
                self._abort_if_unique_id_configured()

                return self.async_create_entry(
                    title=user_input[CONF_NAME],
                    data=user_input,
                )

        return self.async_show_form(
            step_id="user",
            data_schema=STEP_USER_DATA_SCHEMA,
            errors=errors,
        )
