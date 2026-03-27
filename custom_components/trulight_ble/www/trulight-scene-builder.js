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
    this._lastRawHex = null;
    this._lastSceneHex = null;  // Persists last F7 scene across power toggles
    this._activeSceneName = null;
  }

  setConfig(config) {
    this._config = config;
    this._entityId = config.entity || 'light.trulight_backyard_test';
    this._commandEntityId = config.command_entity || 'text.home_assistant_voice_094737_trulight_backyard_command';
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    // Track the command entity to detect scene changes
    if (hass && this._commandEntityId) {
      const state = hass.states[this._commandEntityId];
      if (state && state.state !== 'unknown' && state.state !== 'unavailable') {
        const newHex = state.state;
        // Only update if it's a new F7 scene command
        if (newHex.startsWith('AAF7') && newHex !== this._lastRawHex) {
          this._lastRawHex = newHex;
          this._lastSceneHex = newHex;  // Remember last scene
          this._updateActiveScene();
        } else if (!newHex.startsWith('AAF7') && newHex !== this._lastRawHex) {
          this._lastRawHex = newHex;
          // Power or other command — keep showing last scene
          if (this._lastSceneHex) {
            this._updateActiveScene();
          }
        }
      }
    }
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

        /* Active scene */
        .active-scene {
          background: var(--secondary-background-color, #f5f5f5);
          border-radius: 12px;
          padding: 12px;
          margin-bottom: 12px;
        }
        .active-label {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--primary-text-color);
        }
        .edit-active-btn {
          padding: 4px 12px;
          border-radius: 6px;
          border: 1px solid var(--primary-color, #03a9f4);
          background: transparent;
          color: var(--primary-color, #03a9f4);
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .edit-active-btn:hover {
          background: var(--primary-color, #03a9f4);
          color: white;
        }
        .active-colors {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
          justify-content: center;
        }
        .active-dot {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 2px solid rgba(0,0,0,0.1);
        }
        .divider {
          height: 1px;
          background: var(--divider-color, #ddd);
          margin: 12px 0;
        }
        .active-info {
          font-size: 11px;
          color: var(--secondary-text-color);
          text-align: center;
          margin-top: 4px;
        }

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
          flex: 1;
          padding: 10px;
          border-radius: 8px;
          border: 1px solid var(--divider-color, #ddd);
          background: transparent;
          color: var(--secondary-text-color);
          font-size: 13px;
          cursor: pointer;
          margin-top: 8px;
        }

        /* Save button */
        .save-btn {
          flex: 1;
          padding: 10px;
          border-radius: 8px;
          border: none;
          background: #4CAF50;
          color: white;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 8px;
          transition: filter 0.2s;
        }
        .save-btn:hover { filter: brightness(1.1); }

        /* Save dialog */
        .save-dialog {
          margin-top: 12px;
          padding: 16px;
          background: var(--secondary-background-color, #f5f5f5);
          border-radius: 12px;
          border: 1px solid var(--divider-color, #ddd);
        }
        .save-dialog label {
          font-size: 13px;
          font-weight: 500;
          color: var(--primary-text-color);
        }
        .save-dialog input[type="text"] {
          width: 100%;
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid var(--divider-color, #ddd);
          font-size: 14px;
          margin-top: 4px;
          box-sizing: border-box;
        }
      </style>

      <div class="card">
        <div class="title">
          <ha-icon icon="mdi:creation"></ha-icon>
          Scene Builder
        </div>

        <!-- Active Scene -->
        <div class="active-scene" id="activeScene">
          <div class="active-label">
            <span>▶ Now Playing: <span id="activeSceneName" style="color:var(--primary-color, #03a9f4);">—</span></span>
            <button class="edit-active-btn" id="editActiveBtn">Load into Builder</button>
          </div>
          <div class="active-colors" id="activeColors"></div>
        </div>

        <div class="divider"></div>

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

        <!-- Preview & Save Buttons -->
        <button class="preview-btn" id="previewBtn">
          ▶ PREVIEW ON LIGHTS
        </button>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="save-btn" id="saveBtn">💾 SAVE SCENE</button>
          <button class="clear-btn" id="clearAllBtn" style="margin-top:0;">Clear All Colors</button>
        </div>

        <!-- Save dialog -->
        <div id="saveDialog" class="save-dialog" style="display:none;">
          <div class="save-dialog-content">
            <label>Scene Name:</label>
            <input type="text" id="sceneNameInput" placeholder="My Custom Scene">
            <div style="display:flex; gap:8px; margin-top:8px;">
              <button class="picker-btn active" id="saveConfirmBtn">Save</button>
              <button class="picker-btn" id="saveCancelBtn">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this._setupColorSlots();
    this._setupQuickColors();
    this._setupControls();
    this._setupPreview();
    this._setupActiveScene();
  }

  _updateActiveScene() {
    const container = this.shadowRoot.getElementById('activeColors');
    const activeScene = this.shadowRoot.getElementById('activeScene');
    if (!container || !this._lastSceneHex) return;

    // Parse the F7 hex command to extract colors
    const parsed = this._parseHex(this._lastSceneHex);
    if (!parsed) {
      activeScene.style.display = 'none';
      return;
    }

    activeScene.style.display = 'block';
    container.innerHTML = '';

    // Show scene name from input_select if available
    const nameEl = this.shadowRoot.getElementById('activeSceneName');
    if (this._hass) {
      const catState = this._hass.states['input_select.trulight_category'];
      const sceneState = this._hass.states['input_select.trulight_scene'];
      if (catState && sceneState && sceneState.state !== 'Select a category first') {
        nameEl.textContent = `${catState.state} — ${sceneState.state}`;
      } else {
        nameEl.textContent = 'Custom';
      }
    }

    // Show the palette colors
    const colorCount = parsed.colorCount || parsed.colors.length;
    for (let i = 0; i < Math.min(colorCount, 16); i++) {
      const c = parsed.colors[i];
      const dot = document.createElement('div');
      dot.className = 'active-dot';
      if (c[0] === 0 && c[1] === 0 && c[2] === 0) {
        dot.style.background = '#1a1a1a';
        dot.style.border = '2px solid #555';
      } else if (c[0] > 240 && c[1] > 240 && c[2] > 240) {
        // Near-white colors need a visible border
        dot.style.background = `rgb(${c[0]},${c[1]},${c[2]})`;
        dot.style.border = '2px solid #ccc';
      } else {
        dot.style.background = `rgb(${c[0]},${c[1]},${c[2]})`;
      }
      container.appendChild(dot);
    }

    // Show effect info
    let info = container.parentElement.querySelector('.active-info');
    if (!info) {
      info = document.createElement('div');
      info.className = 'active-info';
      container.parentElement.appendChild(info);
    }
    const effectName = this._getEffectName(parsed.model);
    info.textContent = `${effectName} · ${colorCount} colors · Speed ${Math.round(parsed.speed/255*100)}% · Density ${Math.round(parsed.density/255*100)}%`;
  }

  _parseHex(hex) {
    if (!hex || hex.length < 48 || !hex.startsWith('AAF7')) return null;
    try {
      const model = parseInt(hex.substr(6, 2), 16);
      const speed = parseInt(hex.substr(8, 2), 16);
      const density = parseInt(hex.substr(10, 2), 16);
      const brightness = parseInt(hex.substr(12, 2), 16);
      const direction = parseInt(hex.substr(14, 2), 16);

      // Palette starts at byte 24 (hex offset 48)
      const colors = [];
      for (let i = 0; i < 16; i++) {
        const off = 48 + i * 10; // 5 bytes = 10 hex chars
        if (off + 6 <= hex.length) {
          const r = parseInt(hex.substr(off, 2), 16);
          const g = parseInt(hex.substr(off + 2, 2), 16);
          const b = parseInt(hex.substr(off + 4, 2), 16);
          colors.push([r, g, b]);
        }
      }

      const colorCount = parseInt(hex.substr(hex.length - 2, 2), 16);

      return { model, speed, density, brightness, direction, colors, colorCount };
    } catch (e) {
      return null;
    }
  }

  _getEffectName(modelId) {
    const map = {
      0: 'Static', 1: 'Breathing', 2: 'Color Wipe', 7: 'BPM', 10: 'Rainbow',
      11: 'Rainbow Cycle', 12: 'Scan', 13: 'Dual Scan', 14: 'Fade',
      15: 'Theater Chase', 17: 'Running Lights', 18: 'Twinkle',
      23: 'Dissolve', 28: 'Fairy', 33: 'Fire 2012', 34: 'Fire Flicker',
      37: 'Fireworks', 40: 'Flow', 45: 'Juggle', 46: 'Lake', 47: 'Larson Scanner',
      49: 'Lightning', 51: 'Meteor', 52: 'Meteor Smooth', 59: 'Ocean',
      61: 'Pacifica', 67: 'Popcorn', 80: 'Sinelon', 83: 'Solid Glitter',
      84: 'Sparkle', 90: 'Strobe', 95: 'Sweep', 97: 'TwinkleFox', 108: 'Waves'
    };
    return map[modelId] || `Effect ${modelId}`;
  }

  _loadActiveIntoBuilder() {
    const parsed = this._parseHex(this._lastSceneHex);
    if (!parsed) return;

    // Load colors into builder slots
    this._colors = Array(16).fill(null);
    const count = Math.min(parsed.colorCount || parsed.colors.length, 16);
    for (let i = 0; i < count; i++) {
      const [r, g, b] = parsed.colors[i];
      this._colors[i] = '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
    }

    // Load settings
    this._speed = parsed.speed;
    this._density = parsed.density;
    this._brightness = parsed.brightness;
    this._direction = parsed.direction;

    // Find effect name
    const effectName = this._getEffectName(parsed.model);

    // Update UI
    this._updateSlotVisuals();
    this.shadowRoot.getElementById('speedSlider').value = this._speed;
    this.shadowRoot.getElementById('speedValue').textContent = Math.round(this._speed / 255 * 100) + '%';
    this.shadowRoot.getElementById('densitySlider').value = this._density;
    this.shadowRoot.getElementById('densityValue').textContent = Math.round(this._density / 255 * 100) + '%';
    this.shadowRoot.getElementById('brightnessSlider').value = this._brightness;
    this.shadowRoot.getElementById('brightnessValue').textContent = Math.round(this._brightness / 255 * 100) + '%';
    this.shadowRoot.getElementById('directionSelect').value = this._direction;

    // Set effect if it exists in the dropdown
    const effectSelect = this.shadowRoot.getElementById('effectSelect');
    for (let opt of effectSelect.options) {
      if (opt.value === effectName) {
        effectSelect.value = effectName;
        this._effect = effectName;
        break;
      }
    }

    // Flash the button
    const btn = this.shadowRoot.getElementById('editActiveBtn');
    btn.textContent = '✅ Loaded!';
    setTimeout(() => { btn.textContent = 'Load into Builder'; }, 1500);
  }

  _setupActiveScene() {
    this.shadowRoot.getElementById('editActiveBtn').addEventListener('click', () => {
      this._loadActiveIntoBuilder();
    });
    // Hide active scene initially until we get data
    this.shadowRoot.getElementById('activeScene').style.display = 'none';
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
        slot.style.borderColor = '#ccc';
      } else if (this._colors[i] === '#000000') {
        slot.classList.add('off');
        slot.style.background = '#1a1a1a';
        slot.style.borderColor = '#555';
      } else {
        slot.style.background = this._colors[i];
        // Add visible border for white/light colors
        const r = parseInt(this._colors[i].slice(1,3), 16);
        const g = parseInt(this._colors[i].slice(3,5), 16);
        const b = parseInt(this._colors[i].slice(5,7), 16);
        if (r > 200 && g > 200 && b > 200) {
          slot.style.borderColor = '#bbb';
        } else {
          slot.style.borderColor = 'transparent';
        }
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

    // Save scene functionality
    this.shadowRoot.getElementById('saveBtn').addEventListener('click', () => {
      const dialog = this.shadowRoot.getElementById('saveDialog');
      dialog.style.display = dialog.style.display === 'none' ? 'block' : 'none';
      this.shadowRoot.getElementById('sceneNameInput').focus();
    });

    this.shadowRoot.getElementById('saveCancelBtn').addEventListener('click', () => {
      this.shadowRoot.getElementById('saveDialog').style.display = 'none';
    });

    this.shadowRoot.getElementById('saveConfirmBtn').addEventListener('click', () => {
      const name = this.shadowRoot.getElementById('sceneNameInput').value.trim();
      if (!name) return;
      this._saveScene(name);
      this.shadowRoot.getElementById('saveDialog').style.display = 'none';
      this.shadowRoot.getElementById('sceneNameInput').value = '';
    });
  }

  _saveScene(name) {
    if (!this._hass) return;

    const hex = this._buildHex();

    // Call HA service to save the scene
    this._hass.callService('trulight_ble', 'save_user_scene', {
      entity_id: this._entityId,
      name: name,
      hex: hex
    }).then(() => {
      // Show confirmation
      const btn = this.shadowRoot.getElementById('saveBtn');
      btn.textContent = '✅ Saved!';
      setTimeout(() => { btn.textContent = '💾 SAVE SCENE'; }, 2000);
    }).catch(() => {
      // Fallback: save via input_text if service doesn't exist yet
      this._saveSceneFallback(name, hex);
    });
  }

  _saveSceneFallback(name, hex) {
    // Store in browser localStorage as fallback
    const saved = JSON.parse(localStorage.getItem('trulight_user_scenes') || '{}');
    saved[name] = {
      hex: hex,
      colors: [...this._colors],
      effect: this._effect,
      speed: this._speed,
      density: this._density,
      brightness: this._brightness,
      direction: this._direction,
      created: new Date().toISOString()
    };
    localStorage.setItem('trulight_user_scenes', JSON.stringify(saved));

    // Also fire an event HA can listen to
    this._hass.callService('input_select', 'set_options', {
      entity_id: 'input_select.trulight_scene',
      options: Object.keys(saved)
    }).catch(() => {});

    const btn = this.shadowRoot.getElementById('saveBtn');
    btn.textContent = '✅ Saved locally!';
    setTimeout(() => { btn.textContent = '💾 SAVE SCENE'; }, 2000);
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

  _buildHex() {
    // Collect active colors
    const activeColors = [];
    for (let i = 0; i < 16; i++) {
      if (this._colors[i] !== null) {
        activeColors.push(this._hexToRGB(this._colors[i]));
      }
    }

    if (activeColors.length === 0) {
      activeColors.push([255, 255, 255]);
    }

    const model = this._getEffectId(this._effect);

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
      hex += '0000';
    }

    hex += 'FF'; // PanelId = inline palette

    // 16 palette colors (wrapping)
    for (let i = 0; i < 16; i++) {
      const c = activeColors[i % activeColors.length];
      hex += c[0].toString(16).padStart(2, '0').toUpperCase();
      hex += c[1].toString(16).padStart(2, '0').toUpperCase();
      hex += c[2].toString(16).padStart(2, '0').toUpperCase();
      hex += '0000';
    }

    hex += activeColors.length.toString(16).padStart(2, '0').toUpperCase();
    return hex;
  }

  _sendScene() {
    if (!this._hass) return;
    const hex = this._buildHex();
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
