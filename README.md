<p align="center">
  <img src="logo.png" alt="TruLight BLE" width="300">
</p>

# TruLight BLE - Home Assistant Integration

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://github.com/hacs/integration)

Control TruLight Pro LED controllers from Home Assistant via Bluetooth Low Energy.

**1,167 pre-built scenes** across 69 categories (Christmas, Halloween, USA, Easter, NFL, NBA, and more) plus full RGB color, 163 animation effects, brightness, and zone control.

## How It Works

```
Home Assistant  ──WiFi──>  ESP32  ──Bluetooth──>  TruLight Pro  ──Wired──>  LEDs
                         (BLE proxy)              (controller)
```

The TruLight Pro controller **only accepts commands over Bluetooth** — its WiFi radio acknowledges packets but does not forward them to the LED MCU. An ESP32 microcontroller acts as a bridge: it receives commands from Home Assistant over WiFi and relays them to the TruLight controller over BLE.

**Your TruLight phone app continues to work normally.** This integration does not replace or interfere with the default app — BLE supports multiple connections.

---

## Prerequisites

Before you start, make sure you have the following:

### Hardware

| Item | Purpose | Approx. Cost |
|------|---------|--------------|
| TruLight Pro controller | The LED controller on your roofline | (existing) |
| ESP32-S3 board (one per controller) | BLE proxy — receives WiFi commands, sends BLE | ~$8 |
| USB-C cable + 5V power adapter | Power the ESP32 permanently | ~$5 |
| Computer with USB port | For initial ESP32 firmware flash (one-time) | (existing) |

**Recommended ESP32 board:** [Waveshare ESP32-S3 Mini](https://www.amazon.com/Waveshare-Development-ESP32-S3FH4R2-Dual-Core-Processor/dp/B0CHYHGYRH) — compact, USB-C, BLE 5.0, reliable. Any ESP32 with BLE will work (ESP32-S3, ESP32-C3, original ESP32), but S3 gives the best BLE range.

### Software

| Requirement | Minimum Version | How to Get It |
|-------------|----------------|---------------|
| **Home Assistant** | 2024.1.0+ | [home-assistant.io/installation](https://www.home-assistant.io/installation/) |
| **HACS** (Home Assistant Community Store) | Any | See [HACS Installation](#install-hacs) below |
| **ESPHome addon** | Any | Installed from HA addon store (covered in Step 2) |

### Network

- The ESP32 and Home Assistant must be on the **same network** (or have routable connectivity between them). The ESP32 connects to your WiFi; HA discovers it via mDNS.
- The ESP32 must be within **BLE range (~30 feet / 10 meters)** of the TruLight controller. Walls and metal reduce range.
- The TruLight controller must be **powered on** for BLE discovery and control.

---

## Step-by-Step Setup

### Step 1: Install HACS (if you don't have it) {#install-hacs}

HACS is a community addon store for Home Assistant. If you already have HACS installed, skip to Step 2.

1. Open your Home Assistant instance
2. Navigate to **Settings → Add-ons → Add-on Store**
3. Follow the official HACS installation guide: [hacs.xyz/docs/use/download/download](https://www.hacs.xyz/docs/use/download/download/)
4. After installation, HACS appears in the sidebar

### Step 2: Install the TruLight BLE Integration

**Via HACS (recommended):**

1. Open **HACS** from the HA sidebar
2. Click the **three dots menu** (top right) → **Custom repositories**
3. Paste: `https://github.com/joshewing02/trulight-ha`
4. Select category: **Integration**
5. Click **Add**
6. Back in HACS, search for **"TruLight BLE"** and click **Download**
7. **Restart Home Assistant** (Settings → System → Restart)

**Manual installation (alternative):**

1. Download this repository as a ZIP (Code → Download ZIP on GitHub)
2. Extract and copy the `custom_components/trulight_ble/` folder into your Home Assistant `config/custom_components/` directory
3. Restart Home Assistant

After restart, the integration is installed but not yet configured — you need the ESP32 proxy first.

### Step 3: Install the ESPHome Addon

ESPHome is the firmware that runs on the ESP32. The ESPHome addon in HA lets you configure, compile, and flash the ESP32 firmware.

1. In HA, go to **Settings → Add-ons → Add-on Store**
2. Search for **"ESPHome"**
3. Click **Install**, then **Start**
4. Toggle **"Show in sidebar"** for easy access
5. Open **ESPHome** from the sidebar — you should see an empty dashboard

### Step 4: Create the ESP32 Configuration

1. In the ESPHome dashboard, click **+ New Device**
2. Give it a name (e.g., `trulight-backyard`). This becomes the device name in HA.
3. Select **ESP32-S3** as the device type
4. ESPHome will generate a basic config. **Replace the entire config** with the contents of [`esphome/trulight_ble_proxy.yaml`](esphome/trulight_ble_proxy.yaml) from this repository
5. Update the three `substitutions` at the top:

```yaml
substitutions:
  device_name: trulight-backyard        # Your device name (lowercase, hyphens)
  friendly_name: TruLight Backyard      # Human-readable name
  trulight_mac: "AA:BB:CC:DD:EE:FF"     # Placeholder — you'll find this in Step 5
```

6. **Set up secrets:** ESPHome uses a `secrets.yaml` file for sensitive values. In the ESPHome dashboard, click **Secrets** (top right) and add:

```yaml
api_key: "your-base64-api-key-here"      # Generate: openssl rand -base64 32
ota_password: "your-hex-password-here"    # Generate: openssl rand -hex 16
wifi_ssid: "YourWiFiNetworkName"
wifi_password: "YourWiFiPassword"
```

A template is provided at [`esphome/secrets.yaml.example`](esphome/secrets.yaml.example).

### Step 5: Find Your TruLight BLE MAC Address

Every TruLight controller has a unique BLE MAC address. You need this to tell the ESP32 which controller to connect to.

1. In the ESPHome config you just created, find the `esp32_ble_tracker` section
2. **Uncomment** the `on_ble_advertise` block (remove the `#` from each line):

```yaml
esp32_ble_tracker:
  scan_parameters:
    active: true
    interval: 320ms
    window: 120ms
  on_ble_advertise:
    - then:
        - lambda: |-
            std::string name = x.get_name();
            if (name.length() > 0) {
              ESP_LOGI("ble_scan", "Device: %s  MAC: %s  RSSI: %d",
                name.c_str(), x.address_str().c_str(), x.get_rssi());
            }
```

3. Flash the ESP32 for the first time (see [Step 6: Flash the ESP32](#step-6-flash-the-esp32))
4. After the ESP32 boots and connects to WiFi, open its **Logs** in the ESPHome dashboard
5. Look for a line like:

```
[ble_scan] Device: TruLight Pro  MAC: 9F:DF:9D:3F:8B:C2  RSSI: -62
```

6. Copy the MAC address (e.g., `9F:DF:9D:3F:8B:C2`)
7. Go back to the ESPHome config and:
   - Update `trulight_mac` with the real MAC address
   - **Re-comment** the `on_ble_advertise` block (add `#` back to each line)
8. Flash again (this time wirelessly — see Step 6)

**Tip:** If you see multiple "TruLight Pro" devices, the one with the strongest RSSI (closest to 0) is the nearest controller. Power off one controller to identify which is which.

### Step 6: Flash the ESP32 {#step-6-flash-the-esp32}

#### First-time flash (USB required)

The very first flash must be done over USB because the ESP32 has no firmware yet.

1. Connect the ESP32 to your computer via USB-C
2. In the ESPHome dashboard, click the **three dots** on your device → **Install**
3. Choose one of:
   - **"Plug into the computer running ESPHome"** — if HA and the USB computer are the same machine
   - **"Manual download"** → Select **"Modern format"** → Download the `.bin` file, then go to [web.esphome.io](https://web.esphome.io) in Chrome/Edge on the computer with the USB connection → Click **Connect** → Select the ESP32 serial port → Click **Install** → Choose the downloaded `.bin` file
4. Wait for the flash to complete (~1-2 minutes)
5. The ESP32 will reboot and connect to your WiFi automatically. You should see it come online in the ESPHome dashboard with a green "ONLINE" badge.

#### Subsequent flashes (wireless OTA)

After the first flash, all future updates can be done wirelessly:

1. In the ESPHome dashboard, click the **three dots** on your device → **Install**
2. Choose **"Wirelessly"**
3. ESPHome compiles and uploads over the air (~30 seconds)

### Step 7: Add the ESP32 to Home Assistant

After flashing, HA should automatically discover the ESP32 device:

1. Go to **Settings → Devices & Services**
2. Look for a **"Discovered"** notification for your ESPHome device
3. Click **Configure** → Enter the API encryption key (the `api_key` from your secrets.yaml)
4. The device is now connected

**If it doesn't auto-discover:**

1. Go to **Settings → Devices & Services → + Add Integration**
2. Search for **ESPHome**
3. Enter the ESP32's IP address (find it in the ESPHome dashboard logs or your router's DHCP lease table)
4. Enter the API encryption key

After adding, you should see these entities created by the ESP32:

| Entity | Type | Purpose |
|--------|------|---------|
| `text.trulight_backyard_command` | Text | Hex command input (used internally) |
| `button.trulight_backyard_power_on` | Button | Turn controller on |
| `button.trulight_backyard_power_off` | Button | Turn controller off |
| `binary_sensor.trulight_backyard_power_state` | Binary Sensor | Real-time on/off state |
| `sensor.trulight_backyard_wifi_signal` | Sensor | ESP32 WiFi RSSI |
| `button.trulight_backyard_restart` | Button | Restart ESP32 |

**These entities must be visible in HA before proceeding to Step 8.**

### Step 8: Configure the TruLight BLE Integration

Now wire the HA integration to the ESP32 proxy:

1. Go to **Settings → Devices & Services → + Add Integration**
2. Search for **"TruLight BLE"**
3. Fill in the config form:

| Field | What to Enter | Example |
|-------|--------------|---------|
| **Name** | A friendly name for this controller | `TruLight Backyard` |
| **Command entity** | The ESP32 text entity | `text.trulight_backyard_command` |
| **Power On button** | The ESP32 power on button | `button.trulight_backyard_power_on` |
| **Power Off button** | The ESP32 power off button | `button.trulight_backyard_power_off` |
| **Power State sensor** | The ESP32 power state sensor (optional) | `binary_sensor.trulight_backyard_power_state` |

4. Optionally name your zones (e.g., "Top Roofline", "Bottom Roofline") — each named zone gets its own light entity
5. Click **Submit** — done!

### Step 9: Verify It Works

After configuration, the following entities are created:

| Entity | What It Does |
|--------|-------------|
| `light.trulight_backyard` | Main light entity — on/off, brightness, color, effects |
| `light.trulight_backyard_top_roofline` | Per-zone light (if you named zones) |
| `select.trulight_backyard_zone` | Zone selector for scene browser |
| `select.trulight_backyard_category` | Scene category selector (69 categories) |
| `select.trulight_backyard_scene` | Scene selector within category |
| `button.trulight_backyard_apply_scene` | Sends the selected scene to the controller |

**Quick test:**

1. Open the light entity → toggle it on/off. The TruLight controller should respond.
2. Try the **Effect** dropdown on the light entity — pick any animation.
3. Use the scene browser: pick a category (e.g., "Christmas 1"), pick a scene, press **Apply Scene**.

### Step 10: Place the ESP32 Permanently

Mount the ESP32 within **~30 feet** of your TruLight controller. It only needs USB power — no wiring to the controller.

Good locations:
- Under a soffit or eave near the controller
- In the attic if the controller is roof-mounted
- In a small weatherproof enclosure (like a junction box) if exposed to rain
- Indoors near a window facing the controller

**Tip:** The ESP32 includes a WiFi signal sensor. After placing it, check `sensor.trulight_backyard_wifi_signal` in HA — anything above -75 dBm is solid.

---

## Multiple Controllers

For multiple TruLight controllers (e.g., front yard + backyard):

1. Get one ESP32 per controller
2. Repeat Steps 4-9 for each controller, each with:
   - Its own ESPHome config (different `device_name` and `trulight_mac`)
   - Its own API encryption key in `secrets.yaml`
   - Its own TruLight BLE integration entry in HA
3. Each controller appears as its own set of entities in HA

---

## Usage

### Basic Light Control

The TruLight appears as a standard HA light entity with:
- **On/Off** — toggle power
- **Brightness** — 0-100% slider
- **Color** — RGB color picker (sets all LEDs to a solid color)
- **Effect** — dropdown with 37 curated animation effects (163 total available via service)

### Built-In Scene Browser

No automations or scripts needed — browse and apply scenes directly from HA entities:

1. **Zone Select** (`select.trulight_backyard_zone`) — Target all zones or a specific one
2. **Category Select** (`select.trulight_backyard_category`) — Pick from 69 categories
3. **Scene Select** (`select.trulight_backyard_scene`) — Pick a scene within the category
4. **Apply Scene** (`button.trulight_backyard_apply_scene`) — Press to send

Selecting a scene **stages** it without sending. Press Apply Scene to activate. This prevents accidental scene changes while browsing.

### Scene Builder Card

A custom Lovelace card for building your own scenes from scratch:

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

Call `trulight_ble.set_scene` to apply any of the 1,167 scenes programmatically:

```yaml
service: trulight_ble.set_scene
target:
  entity_id: light.trulight_backyard
data:
  category: "Christmas 1"
  scene_name: "Candycane--static"
```

### Zone Control

Control zones independently (e.g., top roofline in red, bottom in green):

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

### User-Built Scenes

Scenes saved via the Scene Builder card are stored in `config/trulight_ble/user_scenes.json` and appear under the "User Built" category in the scene browser. They survive integration updates.

### Holiday Automation Example

Automatically turn on Christmas lights at sunset in December:

```yaml
automation:
  - alias: "Christmas Lights On at Sunset"
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

  - alias: "Christmas Lights Off at 11 PM"
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

---

## Available Scene Categories

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
| ... and 45 more categories | | **Total** | **1,167** |

---

## Troubleshooting

### ESP32 won't flash over USB

- Try a different USB cable — many cables are charge-only and don't carry data
- Hold the **BOOT** button on the ESP32 while plugging in USB (puts it in flash mode)
- Make sure you're using Chrome or Edge for [web.esphome.io](https://web.esphome.io) (Safari/Firefox don't support WebSerial)

### ESP32 won't connect to WiFi

- Double-check `wifi_ssid` and `wifi_password` in your ESPHome `secrets.yaml`
- The ESP32 only supports **2.4 GHz WiFi** — make sure your SSID isn't 5 GHz only
- If it can't connect, the ESP32 creates a fallback hotspot named `trulight-backyard-fallback` — connect to it and configure WiFi via the captive portal

### BLE scan doesn't find "TruLight Pro"

- Make sure the TruLight controller is **powered on** (plugged in and switched on)
- Move the ESP32 closer — BLE scan range can be shorter than connection range
- Close the TruLight phone app — some phones hold an exclusive BLE connection
- Check ESPHome logs for any BLE-related errors

### Commands sent but lights don't change

- Check ESPHome logs for `"BLE connected to TruLight controller"` — if you don't see this, the MAC address may be wrong
- Verify the MAC address matches (re-run the BLE scan if needed)
- Try power cycling the TruLight controller (unplug and replug)
- Make sure the ESP32 is within BLE range (~30 feet)

### Integration not found in HA after HACS install

- You **must restart Home Assistant** after installing via HACS
- Verify the folder exists: `config/custom_components/trulight_ble/`

### Scene applies but wrong colors appear

- Some scenes target specific zones. Make sure the Zone Select is set to **"All Zones"** unless you intentionally want a single zone.

---

## Technical Details

This integration was built by reverse-engineering the TruLight Pro Android app (APK v2.3.1). The TruLight Pro controller uses a custom BLE GATT protocol:

| Detail | Value |
|--------|-------|
| BLE Service UUID | `0000AE00-0000-1000-8000-00805F9B34FB` |
| Write Characteristic | `0000AE01-0000-1000-8000-00805F9B34FB` |
| Notify Characteristic | `0000AE02-0000-1000-8000-00805F9B34FB` |
| Packet format | `0xAA` + opcode + payload + CRC8-MAXIM checksum |
| CRC polynomial | 0x8C (Dallas/Maxim 1-Wire, reflected) |
| Max zones | 8 per controller |
| Output channels | 4 (Front/Back/East/West) |
| Built-in effects | 163 animation modes in controller firmware |

**Why BLE and not WiFi?** The TruLight Pro controller has both WiFi (Tuya) and BLE radios. However, the WiFi interface only handles Tuya cloud commands and does **not** forward scene/effect commands (DPS 101) to the LED MCU. BLE is the only control path that actually drives the LEDs. The phone app uses BLE exclusively.

The ESP32 handles all BLE communication and CRC8-MAXIM computation. Home Assistant communicates with the ESP32 over WiFi using the ESPHome native API. Commands are sent as hex strings to a text entity; the ESP32 firmware parses the hex, computes the CRC, and writes the raw bytes to the BLE characteristic.

---

## Files in This Repository

```
trulight-ha/
  custom_components/
    trulight_ble/
      __init__.py          # Integration setup, service registration
      config_flow.py       # UI configuration wizard
      const.py             # Constants and effect/scene definitions
      light.py             # Light entity (on/off, brightness, color, effects)
      button.py            # Apply Scene button entity
      select.py            # Zone, Category, Scene select entities
      services.yaml        # Service definitions (set_scene, set_zone)
      manifest.json        # HACS/HA integration metadata
      strings.json         # UI strings
      translations/en.json # English translations
      data/
        scene_commands.json # 1,167 pre-built scene hex commands
      www/
        trulight-scene-builder.js  # Custom Lovelace card
  esphome/
    trulight_ble_proxy.yaml    # ESP32 firmware config (copy to ESPHome)
    secrets.yaml.example       # Template for ESPHome secrets
  hacs.json                    # HACS repository metadata
  logo.png                     # Integration logo
  icon.png                     # Integration icon
  icon@2x.png                  # Integration icon (2x)
  README.md                    # This file
```

---

## License

MIT

## Credits

- Reverse engineering and integration by [@joshewing02](https://github.com/joshewing02)
- Built with [ESPHome](https://esphome.io) and [Home Assistant](https://www.home-assistant.io)
