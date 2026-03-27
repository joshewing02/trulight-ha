/**
 * TruLight Scene Builder Card
 * Custom Lovelace card for building and previewing LED scenes.
 * 16 color circles + effect/speed/density controls + preview button.
 */

class TruLightSceneBuilder extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._colors = Array(16).fill(null); // null = grey (unused)
    this._activeSlot = null;
    this._effect = 'Static';
    this._speed = 128;
    this._density = 179;
    this._brightness = 255;
    this._direction = 0;
  }

  setConfig(config) {
    this._config = config;
    this._entityId = config.entity || 'light.trulight_backyard_test';
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
  }

  _render() {
    const effects = [
      'Static', 'Breathing', 'Fade', 'Color Wipe', 'Rainbow', 'Rainbow Cycle',
      'Running Lights', 'Chase Color', 'Tricolor Chase', 'Theater Chase',
      'Twinkle', 'TwinkleFox', 'Sparkle', 'Solid Glitter', 'Fire 2012',
      'Fire Flicker', 'Aurora', 'Pacifica', 'Ocean', 'Lake', 'Meteor',
      'Meteor Smooth', 'Lightning', 'Fireworks', 'Bouncing Balls', 'Popcorn',
      'Scan', 'Dual Scan', 'Larson Scanner', 'Sinelon', 'Strobe', 'BPM',
      'Juggle', 'Dissolve', 'Flow', 'Sweep', 'Waves'
    ];

    const directions = ['Right', 'Left', 'Center Out', 'Outside In', 'Alternate'];

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 16px;
        }
        .card {
          background: var(--ha-card-background, var(--card-background-color, white));
          border-radius: var(--ha-card-border-radius, 12px);
          box-shadow: var(--ha-card-box-shadow, 0 2px 6px rgba(0,0,0,0.1));
          padding: 20px;
        }
        .title {
          font-size: 1.2em;
          font-weight: 600;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .title ha-icon { --mdc-icon-size: 24px; }

        /* Color circles */
        .color-row {
          display: flex;
          gap: 6px;
          margin-bottom: 20px;
          flex-wrap: wrap;
          justify-content: center;
        }
        .color-slot {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 3px solid transparent;
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
        }
        .color-slot.empty {
          background: #e0e0e0;
          border-color: #ccc;
        }
        .color-slot.off {
          background: #1a1a1a;
          border-color: #555;
        }
        .color-slot.active {
          border-color: var(--primary-color, #03a9f4);
          box-shadow: 0 0 0 2px var(--primary-color, #03a9f4);
        }
        .color-slot:hover {
          transform: scale(1.1);
        }
        .color-slot .index {
          position: absolute;
          bottom: -16px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 10px;
          color: var(--secondary-text-color, #888);
        }

        /* Color picker */
        .picker-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
          flex-wrap: wrap;
          justify-content: center;
        }
        .picker-row input[type="color"] {
          width: 60px;
          height: 40px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          padding: 0;
        }
        .picker-btn {
          padding: 6px 14px;
          border-radius: 8px;
          border: 1px solid var(--divider-color, #ddd);
          background: var(--card-background-color, white);
          cursor: pointer;
          font-size: 13px;
          transition: background 0.2s;
        }
        .picker-btn:hover {
          background: var(--primary-color, #03a9f4);
          color: white;
        }
        .picker-btn.active {
          background: var(--primary-color, #03a9f4);
          color: white;
        }

        /* Quick colors */
        .quick-colors {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          justify-content: center;
          margin-bottom: 16px;
        }
        .quick-color {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          cursor: pointer;
          border: 2px solid rgba(0,0,0,0.15);
          transition: transform 0.15s;
        }
        .quick-color:hover { transform: scale(1.2); }

        /* Controls */
        .controls {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 16px;
        }
        .control-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .control-group label {
          font-size: 12px;
          font-weight: 500;
          color: var(--secondary-text-color, #888);
          text-transform: uppercase;
        }
        .control-group select, .control-group input[type="range"] {
          width: 100%;
          padding: 6px;
          border-radius: 8px;
          border: 1px solid var(--divider-color, #ddd);
          background: var(--card-background-color, white);
          font-size: 13px;
        }
        .slider-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .slider-row input { flex: 1; }
        .slider-row .value {
          font-size: 13px;
          min-width: 35px;
          text-align: right;
          color: var(--secondary-text-color);
        }

        /* Preview button */
        .preview-btn {
          width: 100%;
          padding: 14px;
          border-radius: 12px;
          border: none;
          background: var(--primary-color, #03a9f4);
          color: white;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .preview-btn:hover {
          filter: brightness(1.1);
        }
        .preview-btn:active {
          transform: scale(0.98);
        }

        /* Clear button */
        .clear-btn {
          width: 100%;
          padding: 10px;
          border-radius: 8px;
          border: 1px solid var(--divider-color, #ddd);
          background: transparent;
          color: var(--secondary-text-color);
          font-size: 13px;
          cursor: pointer;
          margin-top: 8px;
        }
      </style>

      <div class="card">
        <div class="title">
          <ha-icon icon="mdi:creation"></ha-icon>
          Scene Builder
        </div>

        <!-- 16 Color Circles -->
        <div class="color-row" id="colorRow"></div>

        <!-- Color Picker -->
        <div class="picker-row">
          <input type="color" id="colorPicker" value="#ff0000">
          <button class="picker-btn" id="setColorBtn">Set Color</button>
          <button class="picker-btn" id="setBlackBtn">Set Off</button>
          <button class="picker-btn" id="clearSlotBtn">Clear</button>
        </div>

        <!-- Quick Colors -->
        <div class="quick-colors" id="quickColors"></div>

        <!-- Controls -->
        <div class="controls">
          <div class="control-group">
            <label>Effect</label>
            <select id="effectSelect">
              ${effects.map(e => `<option value="${e}">${e}</option>`).join('')}
            </select>
          </div>
          <div class="control-group">
            <label>Direction</label>
            <select id="directionSelect">
              ${directions.map((d, i) => `<option value="${i}">${d}</option>`).join('')}
            </select>
          </div>
          <div class="control-group">
            <label>Speed</label>
            <div class="slider-row">
              <input type="range" id="speedSlider" min="0" max="255" value="128">
              <span class="value" id="speedValue">50%</span>
            </div>
          </div>
          <div class="control-group">
            <label>Density</label>
            <div class="slider-row">
              <input type="range" id="densitySlider" min="0" max="255" value="179">
              <span class="value" id="densityValue">70%</span>
            </div>
          </div>
          <div class="control-group">
            <label>Brightness</label>
            <div class="slider-row">
              <input type="range" id="brightnessSlider" min="0" max="255" value="255">
              <span class="value" id="brightnessValue">100%</span>
            </div>
          </div>
        </div>

        <!-- Preview Button -->
        <button class="preview-btn" id="previewBtn">
          ▶ PREVIEW ON LIGHTS
        </button>
        <button class="clear-btn" id="clearAllBtn">Clear All Colors</button>
      </div>
    `;

    this._setupColorSlots();
    this._setupQuickColors();
    this._setupControls();
    this._setupPreview();
  }

  _setupColorSlots() {
    const row = this.shadowRoot.getElementById('colorRow');
    row.innerHTML = '';
    for (let i = 0; i < 16; i++) {
      const slot = document.createElement('div');
      slot.className = 'color-slot empty';
      slot.dataset.index = i;
      slot.innerHTML = `<span class="index">${i + 1}</span>`;
      slot.addEventListener('click', () => this._selectSlot(i));
      row.appendChild(slot);
    }
    this._updateSlotVisuals();
  }

  _setupQuickColors() {
    const quickColors = [
      '#FF0000', '#00FF00', '#0000FF', '#FFFFFF', '#FF8800',
      '#FFFF00', '#FF00FF', '#00FFFF', '#800080', '#FFB6C1',
      '#FF4500', '#32CD32', '#4169E1', '#FFD700', '#000000'
    ];

    const container = this.shadowRoot.getElementById('quickColors');
    container.innerHTML = '';
    quickColors.forEach(color => {
      const dot = document.createElement('div');
      dot.className = 'quick-color';
      dot.style.background = color;
      if (color === '#000000') {
        dot.style.border = '2px solid #555';
      }
      dot.addEventListener('click', () => {
        this.shadowRoot.getElementById('colorPicker').value = color;
        if (this._activeSlot !== null) {
          this._setSlotColor(this._activeSlot, color);
        }
      });
      container.appendChild(dot);
    });
  }

  _setupControls() {
    const speedSlider = this.shadowRoot.getElementById('speedSlider');
    const densitySlider = this.shadowRoot.getElementById('densitySlider');
    const brightnessSlider = this.shadowRoot.getElementById('brightnessSlider');

    speedSlider.addEventListener('input', (e) => {
      this._speed = parseInt(e.target.value);
      this.shadowRoot.getElementById('speedValue').textContent = Math.round(this._speed / 255 * 100) + '%';
    });

    densitySlider.addEventListener('input', (e) => {
      this._density = parseInt(e.target.value);
      this.shadowRoot.getElementById('densityValue').textContent = Math.round(this._density / 255 * 100) + '%';
    });

    brightnessSlider.addEventListener('input', (e) => {
      this._brightness = parseInt(e.target.value);
      this.shadowRoot.getElementById('brightnessValue').textContent = Math.round(this._brightness / 255 * 100) + '%';
    });

    this.shadowRoot.getElementById('effectSelect').addEventListener('change', (e) => {
      this._effect = e.target.value;
    });

    this.shadowRoot.getElementById('directionSelect').addEventListener('change', (e) => {
      this._direction = parseInt(e.target.value);
    });

    this.shadowRoot.getElementById('setColorBtn').addEventListener('click', () => {
      if (this._activeSlot !== null) {
        const color = this.shadowRoot.getElementById('colorPicker').value;
        this._setSlotColor(this._activeSlot, color);
      }
    });

    this.shadowRoot.getElementById('setBlackBtn').addEventListener('click', () => {
      if (this._activeSlot !== null) {
        this._setSlotColor(this._activeSlot, '#000000');
      }
    });

    this.shadowRoot.getElementById('clearSlotBtn').addEventListener('click', () => {
      if (this._activeSlot !== null) {
        this._colors[this._activeSlot] = null;
        this._updateSlotVisuals();
      }
    });

    this.shadowRoot.getElementById('clearAllBtn').addEventListener('click', () => {
      this._colors = Array(16).fill(null);
      this._activeSlot = null;
      this._updateSlotVisuals();
    });
  }

  _selectSlot(index) {
    this._activeSlot = index;
    this._updateSlotVisuals();
    // Auto-set next empty slot if clicking an empty one
    if (this._colors[index] === null) {
      const color = this.shadowRoot.getElementById('colorPicker').value;
      this._setSlotColor(index, color);
    }
  }

  _setSlotColor(index, hexColor) {
    this._colors[index] = hexColor;
    this._updateSlotVisuals();
    // Auto-advance to next slot
    if (index < 15) {
      this._activeSlot = index + 1;
      this._updateSlotVisuals();
    }
  }

  _updateSlotVisuals() {
    const slots = this.shadowRoot.querySelectorAll('.color-slot');
    slots.forEach((slot, i) => {
      slot.classList.remove('active', 'empty', 'off');
      if (this._colors[i] === null) {
        slot.classList.add('empty');
        slot.style.background = '#e0e0e0';
      } else if (this._colors[i] === '#000000') {
        slot.classList.add('off');
        slot.style.background = '#1a1a1a';
      } else {
        slot.style.background = this._colors[i];
      }
      if (i === this._activeSlot) {
        slot.classList.add('active');
      }
    });
  }

  _setupPreview() {
    this.shadowRoot.getElementById('previewBtn').addEventListener('click', () => {
      this._sendScene();
    });
  }

  _hexToRGB(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
  }

  _getEffectId(name) {
    const map = {
      'Static': 0, 'Breathing': 1, 'Fade': 14, 'Color Wipe': 2,
      'Rainbow': 10, 'Rainbow Cycle': 11, 'Running Lights': 17,
      'Chase Color': 11, 'Tricolor Chase': 13, 'Theater Chase': 15,
      'Twinkle': 18, 'TwinkleFox': 97, 'Sparkle': 84, 'Solid Glitter': 83,
      'Fire 2012': 33, 'Fire Flicker': 34, 'Aurora': 2, 'Pacifica': 61,
      'Ocean': 59, 'Lake': 46, 'Meteor': 51, 'Meteor Smooth': 52,
      'Lightning': 49, 'Fireworks': 37, 'Bouncing Balls': 6, 'Popcorn': 67,
      'Scan': 12, 'Dual Scan': 13, 'Larson Scanner': 47, 'Sinelon': 80,
      'Strobe': 90, 'BPM': 7, 'Juggle': 45, 'Dissolve': 23,
      'Flow': 40, 'Sweep': 95, 'Waves': 108
    };
    return map[name] || 0;
  }

  _sendScene() {
    if (!this._hass) return;

    // Collect active colors
    const activeColors = [];
    for (let i = 0; i < 16; i++) {
      if (this._colors[i] !== null) {
        activeColors.push(this._hexToRGB(this._colors[i]));
      }
    }

    if (activeColors.length === 0) {
      activeColors.push([255, 255, 255]); // default white
    }

    const model = this._getEffectId(this._effect);

    // Build F7 command
    let hex = 'AAF7';
    hex += '00'; // zone = all
    hex += model.toString(16).padStart(2, '0').toUpperCase();
    hex += this._speed.toString(16).padStart(2, '0').toUpperCase();
    hex += this._density.toString(16).padStart(2, '0').toUpperCase();
    hex += this._brightness.toString(16).padStart(2, '0').toUpperCase();
    hex += this._direction.toString(16).padStart(2, '0').toUpperCase();

    // Foreground colors (first 3 from palette)
    for (let i = 0; i < 3; i++) {
      const c = activeColors[i % activeColors.length];
      hex += c[0].toString(16).padStart(2, '0').toUpperCase();
      hex += c[1].toString(16).padStart(2, '0').toUpperCase();
      hex += c[2].toString(16).padStart(2, '0').toUpperCase();
      hex += '0000'; // CW, W
    }

    // PanelId = 0xFF (inline palette)
    hex += 'FF';

    // 16 palette colors (wrapping)
    for (let i = 0; i < 16; i++) {
      const c = activeColors[i % activeColors.length];
      hex += c[0].toString(16).padStart(2, '0').toUpperCase();
      hex += c[1].toString(16).padStart(2, '0').toUpperCase();
      hex += c[2].toString(16).padStart(2, '0').toUpperCase();
      hex += '0000'; // CW, W
    }

    // Color count
    hex += activeColors.length.toString(16).padStart(2, '0').toUpperCase();

    // Send via the integration's send_raw service
    this._hass.callService('trulight_ble', 'send_raw', {
      entity_id: this._entityId,
      hex: hex
    });
  }

  getCardSize() {
    return 8;
  }

  static getStubConfig() {
    return { entity: 'light.trulight_backyard_test' };
  }
}

customElements.define('trulight-scene-builder', TruLightSceneBuilder);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'trulight-scene-builder',
  name: 'TruLight Scene Builder',
  description: 'Build custom LED scenes with 16 color palette, effects, and live preview',
  preview: true,
});
