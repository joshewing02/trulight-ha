<p align="center">
  <img src="logo.png" alt="TruLight BLE" width="300">
</p>

# TruLight BLE - Home Assistant Integration

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://github.com/hacs/integration)

Control TruLight Pro LED controllers from Home Assistant via Bluetooth Low Energy.

**1,167 pre-built scenes** across 69 categories (Christmas, Halloween, USA, Easter, NFL, NBA, and more) plus full RGB color, 163 animation effects, brightness, and zone control.

## How It Works

```
Home Assistant  →  ESP32 (BLE Proxy)  →  TruLight Pro Controller  →  LEDs
   (WiFi)            (Bluetooth)              (Wired)
```

The TruLight Pro controller only accepts commands over Bluetooth (not WiFi). An ESP32 microcontroller acts as a bridge — it receives commands from Home Assistant over WiFi and relays them to the TruLight controller over BLE.

**Your TruLight phone app continues to work normally.** This integration does not interfere with the default app.

## What You Need

| Item | Purpose | Cost |
|------|---------|------|
| TruLight Pro controller | The LED controller on your roofline | (existing) |
| ESP32-S3 board | BLE proxy (one per controller) | ~$8 each |
| USB-C cable + power adapter | Power the ESP32 | ~$5 |
| Home Assistant | Smart home hub | (existing) |
| ESPHome addon | Manages the ESP32 firmware | Free |

**Recommended ESP32:** [Waveshare ESP32-S3 Mini](https://www.amazon.com/Waveshare-Development-ESP32-S3FH4R2-Dual-Core-Processor/dp/B0CHYHGYRH) — tiny, USB-C, BLE 5.0

## Installation

### Step 1: Install the HA Integration

**Via HACS (recommended):**
1. Open HACS in Home Assistant
2. Click the three dots → Custom repositories
3. Add `https://github.com/joshewing02/trulight-ha` as an Integration
4. Search for "TruLight BLE" and install
5. Restart Home Assistant

**Manual:**
1. Copy the `custom_components/trulight_ble` folder to your HA `config/custom_components/` directory
2. Restart Home Assistant

### Step 2: Set Up the ESP32 BLE Proxy

1. Install the **ESPHome** addon in Home Assistant (Settings → Add-ons → ESPHome)
2. Open the ESPHome dashboard
3. Click **+ New Device** → give it a name (e.g., `trulight-backyard`)
4. Choose **ESP32-S3** as the board
5. Replace the generated config with the contents of `esphome/trulight_ble_proxy.yaml`

#### Find Your TruLight BLE MAC Address

Before flashing, you need to find your TruLight controller's BLE MAC address:

1. In the ESPHome config, uncomment the `on_ble_advertise` section
2. Flash the ESP32 (first time requires USB, subsequent updates are wireless)
3. Watch the ESPHome logs for a device named **"TruLight Pro"**
4. Note the MAC address (format: `XX:XX:XX:XX:XX:XX`)
5. Update `trulight_mac` in the config with your MAC address
6. Comment out the `on_ble_advertise` section again
7. Reflash

#### Flash the ESP32

**First time (USB):**
1. Connect the ESP32 to a computer via USB
2. Option A: In ESPHome dashboard, click Install → Plug into this computer
3. Option B: In ESPHome dashboard, click Install → Manual download → Modern format, then flash the `.bin` file at [web.esphome.io](https://web.esphome.io) from the computer with the USB connection

**Subsequent updates (wireless):**
1. In ESPHome dashboard, click Install → Wirelessly (OTA)

### Step 3: Add the ESP32 to Home Assistant

After flashing, the ESP32 connects to WiFi and should appear as a discovered ESPHome device in **Settings → Devices & Services**. If it doesn't auto-discover:

1. Go to Settings → Devices & Services → ESPHome
2. Click **Add Device**
3. Enter the ESP32's IP address (check your router's DHCP leases or ESPHome logs)
4. Enter the API encryption key from your `secrets.yaml`

The ESP32's entities (command text, power buttons, power state sensor) must be visible in HA before configuring the TruLight integration.

### Step 4: Configure the Integration

1. In HA, go to Settings → Devices & Services → Add Integration
2. Search for **TruLight BLE**
3. Enter:
   - **Name**: e.g., "TruLight Backyard" or "TruLight Front Yard"
   - **Command entity**: The ESPHome text entity (e.g., `text.trulight_backyard_command`)
   - **Power On button**: The ESPHome power on button (e.g., `button.trulight_backyard_power_on`)
   - **Power Off button**: The ESPHome power off button (e.g., `button.trulight_backyard_power_off`)
   - **Power State sensor** (optional): The ESPHome binary sensor (e.g., `binary_sensor.trulight_backyard_power_state`)
4. Optionally name your zones (e.g., "Top Roofline", "Bottom Roofline") — each zone gets its own light entity
5. Done! A light entity will appear in HA.

### Step 5: Place the ESP32

Mount the ESP32 within **~30 feet** of your TruLight controller. It only needs USB power — no wiring to the controller.

- Under a soffit/eave near the controller
- In the attic if the controller is roof-mounted
- In a small waterproof box if exposed to weather

## Usage

### Basic Control

The TruLight appears as a standard HA light entity:
- **On/Off** — toggle power
- **Brightness** — 0-100% slider
- **Color** — RGB color picker
- **Effect** — dropdown with 37 curated animation effects (163 total available via service)

### Built-In Scene Browser

The integration creates select entities and a button for browsing and applying scenes:

- **Zone Select** (`select.trulight_backyard_zone`) — Pick which zone to target (All Zones, or a specific zone)
- **Category Select** (`select.trulight_backyard_category`) — Pick from 69 categories
- **Scene Select** (`select.trulight_backyard_scene`) — Pick a scene within the category
- **Apply Scene** (`button.trulight_backyard_apply_scene`) — Press to send the selected scene to the controller

Selecting a scene stages it without sending — press Apply Scene to activate. No automations, input_selects, or scripts needed.

### Scene Builder Card

A custom Lovelace card is auto-registered for building your own scenes:

```yaml
type: custom:trulight-scene-builder
entity: light.trulight_backyard
```

Features:
- **16 color palette** — tap circles to set colors, quick-color presets
- **Effect selector** — 37 animations with speed, density, brightness, and direction controls
- **Live preview** — sends your creation to the lights instantly
- **Now Playing** — shows the active scene's colors and effect in real-time
- **Load into Builder** — import the currently playing scene to edit it
- **Save scene** — save your creation to the "User Built" category

### Pre-Built Scenes via Service

Call `trulight_ble.set_scene` to apply any of the 1,167 pre-built scenes:

```yaml
service: trulight_ble.set_scene
target:
  entity_id: light.trulight_backyard
data:
  category: "Christmas 1"
  scene_name: "Candycane--static"
```

### Zone Control

Control zones independently (e.g., top roofline vs bottom roofline):

```yaml
service: trulight_ble.set_zone
target:
  entity_id: light.trulight_backyard
data:
  zone: 1
  effect: "Rainbow Cycle"
  rgb_color: [255, 0, 0]
  brightness: 200
  speed: 180
```

If you configured zones during setup, each zone also gets its own light entity (e.g., `light.trulight_backyard_top_roofline`).

### User-Built Scenes

Scenes saved via the Scene Builder card are stored in `config/trulight_ble/user_scenes.json` and appear under the "User Built" category in the scene browser. They survive integration updates.

### Holiday Automation Example

```yaml
automation:
  - alias: "Christmas Lights"
    trigger:
      - platform: sun
        event: sunset
    condition:
      - condition: template
        value_template: "{{ now().month == 12 }}"
    action:
      - service: light.turn_on
        target:
          entity_id: light.trulight_backyard
      - service: trulight_ble.set_scene
        target:
          entity_id: light.trulight_backyard
        data:
          category: "Christmas 1"
          scene_name: "Candycane--static"

  - alias: "Christmas Lights Off"
    trigger:
      - platform: time
        at: "23:00:00"
    condition:
      - condition: template
        value_template: "{{ now().month == 12 }}"
    action:
      - service: light.turn_off
        target:
          entity_id: light.trulight_backyard
```

### Dashboard Example

```yaml
type: vertical-stack
cards:
  - type: tile
    entity: light.trulight_backyard
    icon: mdi:led-strip-variant
    color: amber
    features:
      - type: light-brightness
  - type: tile
    entity: select.trulight_backyard_zone
    name: Apply To
  - type: tile
    entity: select.trulight_backyard_category
    name: Category
  - type: tile
    entity: select.trulight_backyard_scene
    name: Scene
  - type: button
    entity: button.trulight_backyard_apply_scene
    name: APPLY SCENE
    icon: mdi:play-circle
    tap_action:
      action: perform-action
      perform_action: button.press
      target:
        entity_id: button.trulight_backyard_apply_scene
  - type: custom:trulight-scene-builder
    entity: light.trulight_backyard
```

### Available Scene Categories

| Category | Scenes | Category | Scenes |
|----------|--------|----------|--------|
| Christmas 1 | 16 | Halloween 1 | 16 |
| Christmas 2 | 28 | Halloween 2 | 8 |
| Christmas Advent | 28 | Halloween 3 | 16 |
| USA | 13 | Easter | 11 |
| Independence Day | 12 | Thanksgiving | 9 |
| Valentines Day | 8 | St. Patrick's Day | 10 |
| Happy Holidays | 12 | Fireworks 1 | 16 |
| Canada Day | 14 | Fireworks 2 | 10 |
| NFL | 67 | NBA | 63 |
| MLB | 61 | NHL | 12 |
| College Teams | 20 | Disney | 18 |
| Star Wars 1 | 21 | Star Wars 2 | 28 |
| ... and 45 more categories | |

## Multiple Controllers

For multiple TruLight controllers (e.g., front yard + backyard):

1. Flash a separate ESP32 for each controller
2. Each ESP32 needs its own config with the correct MAC address
3. Add the integration once per controller in HA
4. Each controller appears as its own light entity

## Troubleshooting

**ESP32 can't find the TruLight controller:**
- Make sure the ESP32 is within ~30 feet of the controller
- The TruLight controller must be powered on
- Check that the TruLight controller isn't exclusively connected to the phone app via Bluetooth (close the app)

**Commands sent but lights don't change:**
- Verify BLE connection in ESPHome logs (look for "BLE connected")
- Check that the MAC address is correct
- Try power cycling the TruLight controller

**Integration not found in HA:**
- Restart HA after installing the integration
- Check that `custom_components/trulight_ble/` exists in your config directory

## Technical Details

This integration was built by reverse-engineering the TruLight Android app (v2.3.1). The TruLight Pro controller uses a custom BLE protocol with:

- BLE Service: `0000AE00-0000-1000-8000-00805F9B34FB`
- Write Characteristic: `0000AE01-0000-1000-8000-00805F9B34FB`
- Packet format: `AA` + opcode + payload + CRC8-MAXIM checksum
- 163 LED animation effects built into the controller firmware
- Up to 8 independently controllable zones per controller
- 4 output channels (Front/Back/East/West)

The ESP32 handles all BLE communication and CRC computation. Home Assistant communicates with the ESP32 over WiFi using the ESPHome native API.

## License

MIT

## Credits

- Reverse engineering and integration by [@joshewing02](https://github.com/joshewing02)
- Built with [ESPHome](https://esphome.io) and [Home Assistant](https://www.home-assistant.io)
