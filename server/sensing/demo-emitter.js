/**
 * DemoEmitter — server-side demo frame generator
 *
 * Used when no ESP32 is connected. Produces SensingFrames in the same
 * wire format as processCSI() so the frontend sees consistent data.
 *
 * Mirrors the key scenarios from the client-side DemoDataGenerator but
 * runs on the server so the health endpoint works and the WS stream
 * flows even without hardware.
 */

const SCENARIOS = [
  'empty_room', 'single_breathing', 'two_walking', 'fall_event',
  'sleep_monitoring', 'intrusion_detect', 'gesture_control',
  'crowd_occupancy', 'search_rescue', 'elderly_care',
  'fitness_tracking', 'security_patrol',
];

const CYCLE_S = 30;

function _sin(t, freq, phase = 0) { return Math.sin(t * freq * 2 * Math.PI + phase); }
function _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function _signalField(cx, cz, t) {
  const GRID = 20;
  const values = [];
  for (let z = 0; z < GRID; z++) {
    for (let x = 0; x < GRID; x++) {
      const dx = (x / GRID - cx);
      const dz = (z / GRID - cz);
      const r = Math.sqrt(dx * dx + dz * dz);
      const wave = 0.05 * _sin(t, 0.5, r * 4);
      values.push(_clamp(Math.exp(-r * 4) * 0.8 + wave, 0, 1));
    }
  }
  return { grid_size: [20, 1, 20], values };
}

export class DemoEmitter {
  constructor() {
    this._t = 0;
    this._dt = 1 / 12; // ~12 Hz
    this._scenarioIndex = 0;
    this._app = 'presence';
    this._scenarioTimer = 0;
  }

  setApp(app) {
    this._app = app;
  }

  setScenario(scenario) {
    const idx = SCENARIOS.indexOf(scenario);
    if (idx >= 0) {
      this._scenarioIndex = idx;
      this._scenarioTimer = 0;
      this._pinned = true;
    }
  }

  next() {
    this._t += this._dt;

    // Only auto-cycle if not pinned to a specific scenario
    if (!this._pinned) {
      this._scenarioTimer += this._dt;
      if (this._scenarioTimer >= CYCLE_S) {
        this._scenarioTimer = 0;
        this._scenarioIndex = (this._scenarioIndex + 1) % SCENARIOS.length;
      }
    }

    const t = this._t;
    const scenario = SCENARIOS[this._scenarioIndex];
    const app = this._app || scenario;

    return this._generate(scenario, app, t);
  }

  _generate(scenario, app, t) {
    const base = {
      app,
      ts: Date.now() / 1000,
      slot: 0,
      scenario,
      rssi_dbm: -65 + _sin(t, 0.03) * 5,
      signal_field: _signalField(0.5, 0.5, t),
      persons: [],
      estimated_persons: 0,
      classification: { motion_level: 'absent', presence: false, confidence: 0.92 },
    };

    switch (scenario) {
      case 'empty_room':
        break;

      case 'single_breathing': {
        const hr  = 68 + _sin(t, 0.05) * 8;
        const br  = 16 + _sin(t, 0.02) * 3;
        base.classification = { motion_level: 'present_still', presence: true, confidence: 0.91 };
        base.vitals = { heart_rate_bpm: Math.round(hr), breathing_rate_bpm: Math.round(br) };
        base.persons = [{ id: 'p0', position: [0, 0, 0], motion_score: 12, pose: 'standing', facing: 0,
          heart_rate_bpm: Math.round(hr), breathing_rate_bpm: Math.round(br) }];
        base.estimated_persons = 1;
        base.signal_field = _signalField(0.5 + _sin(t, 0.1) * 0.05, 0.5, t);
        break;
      }

      case 'two_walking': {
        const p1x = _sin(t, 0.12) * 2;
        const p1z = _sin(t, 0.09, 1) * 1.5;
        const p2x = _sin(t, 0.11, 2) * 2;
        const p2z = _sin(t, 0.08, 3) * 1.5;
        base.classification = { motion_level: 'active', presence: true, confidence: 0.88 };
        base.persons = [
          { id: 'p0', position: [p1x, 0, p1z], motion_score: 55, pose: 'walking', facing: t * 0.5 % (Math.PI * 2) },
          { id: 'p1', position: [p2x, 0, p2z], motion_score: 50, pose: 'walking', facing: t * 0.4 % (Math.PI * 2) },
        ];
        base.estimated_persons = 2;
        break;
      }

      case 'fall_event': {
        const fallen = (t % 10) > 7;
        base.classification = { motion_level: fallen ? 'present_still' : 'active', presence: true, confidence: 0.93 };
        base.persons = [{ id: 'p0', position: [0, 0, 0], motion_score: fallen ? 5 : 60,
          pose: fallen ? 'lying' : 'walking', facing: 0 }];
        base.estimated_persons = 1;
        break;
      }

      case 'sleep_monitoring': {
        const br = 14 + _sin(t, 0.008) * 4;
        base.classification = { motion_level: 'present_still', presence: true, confidence: 0.95 };
        base.vitals = { heart_rate_bpm: 58, breathing_rate_bpm: Math.round(br) };
        base.persons = [{ id: 'p0', position: [0, 0, 0], motion_score: 3, pose: 'lying', facing: 0,
          breathing_rate_bpm: Math.round(br) }];
        base.estimated_persons = 1;
        break;
      }

      case 'intrusion_detect': {
        const px = _sin(t, 0.07) * 3;
        const pz = _sin(t, 0.05, 1.5) * 2;
        base.classification = { motion_level: 'active', presence: true, confidence: 0.85 };
        base.persons = [{ id: 'p0', position: [px, 0, pz], motion_score: 45, pose: 'walking', facing: t * 0.3 }];
        base.estimated_persons = 1;
        break;
      }

      case 'gesture_control': {
        base.classification = { motion_level: 'active', presence: true, confidence: 0.87 };
        base.persons = [{ id: 'p0', position: [0, 0, 0], motion_score: 40, pose: 'gesturing', facing: 0 }];
        base.estimated_persons = 1;
        break;
      }

      case 'crowd_occupancy': {
        const count = 4;
        base.classification = { motion_level: 'active', presence: true, confidence: 0.80 };
        base.persons = Array.from({ length: count }, (_, i) => ({
          id: `p${i}`,
          position: [
            _sin(t, 0.06 + i * 0.02, i) * 2.5,
            0,
            _sin(t, 0.05 + i * 0.015, i + 1) * 2,
          ],
          motion_score: 30 + i * 5,
          pose: 'standing',
          facing: i * (Math.PI / 2),
        }));
        base.estimated_persons = count;
        break;
      }

      case 'search_rescue': {
        base.classification = { motion_level: 'present_still', presence: true, confidence: 0.79 };
        base.vitals = { heart_rate_bpm: 72, breathing_rate_bpm: 18 };
        base.persons = [{ id: 'p0', position: [1, 0, 1], motion_score: 8, pose: 'lying', facing: 0,
          heart_rate_bpm: 72, breathing_rate_bpm: 18 }];
        base.estimated_persons = 1;
        break;
      }

      case 'elderly_care': {
        const speed = 0.04 + _sin(t, 0.02) * 0.01;
        base.classification = { motion_level: 'active', presence: true, confidence: 0.91 };
        base.persons = [{ id: 'p0', position: [_sin(t, speed) * 2, 0, _sin(t, speed, 1.5) * 1.5],
          motion_score: 22, pose: 'walking', facing: 0 }];
        base.estimated_persons = 1;
        break;
      }

      case 'fitness_tracking': {
        base.classification = { motion_level: 'active', presence: true, confidence: 0.92 };
        base.persons = [{ id: 'p0', position: [0, 0, 0], motion_score: 80, pose: 'exercising', facing: 0 }];
        base.estimated_persons = 1;
        break;
      }

      case 'security_patrol': {
        const px = _sin(t, 0.08) * 3.5;
        const pz = _sin(t, 0.06, 1) * 2.5;
        base.classification = { motion_level: 'active', presence: true, confidence: 0.88 };
        base.persons = [{ id: 'p0', position: [px, 0, pz], motion_score: 50, pose: 'walking', facing: t * 0.4 }];
        base.estimated_persons = 1;
        break;
      }
    }

    return base;
  }
}
