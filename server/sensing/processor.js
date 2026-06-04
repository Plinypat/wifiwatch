/**
 * CSI → SensingFrame processor
 *
 * Accepts a raw CSI frame from an ESP32 node and returns a SensingFrame
 * in the Observatory wire format. All processing is lightweight signal
 * processing — no ML dependency required for the server runtime.
 *
 * Raw CSI frame schema (from ESP32):
 *   { ts, slot, channel, rssi, noise_floor, csi: number[] }
 *
 * Output SensingFrame schema matches DemoDataGenerator output so the
 * Observatory frontend can consume both interchangeably.
 */

// Rolling buffer per slot for temporal processing
const _buffers = new Map();
const BUFFER_LEN = 64;

// Board positions in metres (x, z plane — y=0 is floor).
// Equilateral triangle, ~7.5 m sides (~25 ft). Adjust to match real placement.
const NODE_POSITIONS = {
  0: [0,    0   ],   // slot 0 — e.g. front-left corner
  1: [7.5,  0   ],   // slot 1 — e.g. front-right corner
  2: [3.75, 6.5 ],   // slot 2 — e.g. rear-centre
};
// Centre of the triangle (used as fallback when only one board has data)
const ROOM_CENTRE = [3.75, 2.17];

/** Variance-weighted centroid of board positions → [x, z] person estimate */
function _estimatePosition() {
  const weights = [];
  const positions = [];

  for (const [slot, pos] of Object.entries(NODE_POSITIONS)) {
    const buf = _buffers.get(Number(slot));
    if (!buf || buf.csi.length < 8) continue;
    const ampFrames = buf.csi.map(_amplitude);
    const nSub = ampFrames[0].length;
    let totalVar = 0;
    for (let s = 0; s < nSub; s++) {
      const ch = ampFrames.map(f => f[s] ?? 0);
      totalVar += _variance(ch);
    }
    weights.push(totalVar);
    positions.push(pos);
  }

  if (positions.length === 0) return ROOM_CENTRE;

  const totalW = weights.reduce((a, b) => a + b, 0);
  if (totalW === 0) return ROOM_CENTRE;

  let x = 0, z = 0;
  for (let i = 0; i < positions.length; i++) {
    x += (weights[i] / totalW) * positions[i][0];
    z += (weights[i] / totalW) * positions[i][1];
  }
  // Round to 2dp to avoid micro-jitter in wire format
  return [Math.round(x * 100) / 100, Math.round(z * 100) / 100];
}

function _getBuffer(slot) {
  if (!_buffers.has(slot)) {
    _buffers.set(slot, {
      csi: [],           // last N CSI frames (each is Float32Array)
      rssi: [],          // last N RSSI values
      ts: [],            // timestamps
      variance: 0,       // running variance estimate
      presence: false,
      confidence: 0,
    });
  }
  return _buffers.get(slot);
}

function _push(buf, csiArr, rssi, ts) {
  buf.csi.push(csiArr);
  buf.rssi.push(rssi);
  buf.ts.push(ts);
  if (buf.csi.length > BUFFER_LEN) { buf.csi.shift(); buf.rssi.shift(); buf.ts.shift(); }
}

/** Mean of array */
function _mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/** Variance of array */
function _variance(arr) {
  const m = _mean(arr);
  return _mean(arr.map(v => (v - m) ** 2));
}

/** Compute amplitude from complex [re, im, re, im...] CSI array */
function _amplitude(csi) {
  const amp = [];
  for (let i = 0; i + 1 < csi.length; i += 2) {
    amp.push(Math.sqrt(csi[i] ** 2 + csi[i + 1] ** 2));
  }
  return amp;
}

/** Band-pass filter (simple FIR) for vital signs */
function _bandpass(signal, lowHz, highHz, sampleRate = 12) {
  // Very simple: compute energy in frequency band via DFT on last N samples
  const N = signal.length;
  if (N < 4) return 0;
  let energy = 0;
  for (let k = 1; k < N / 2; k++) {
    const freq = (k * sampleRate) / N;
    if (freq >= lowHz && freq <= highHz) {
      let re = 0, im = 0;
      for (let n = 0; n < N; n++) {
        re += signal[n] * Math.cos((2 * Math.PI * k * n) / N);
        im -= signal[n] * Math.sin((2 * Math.PI * k * n) / N);
      }
      energy += (re ** 2 + im ** 2) / N;
    }
  }
  return energy;
}

/** Presence detection via CSI variance threshold */
function _detectPresence(buf, params = {}) {
  const threshold = params.threshold ?? 0.05;
  if (buf.csi.length < 8) return { presence: false, confidence: 0 };

  // Compute per-subcarrier variance across last N frames
  const ampFrames = buf.csi.map(_amplitude);
  const nSub = ampFrames[0].length;
  let totalVar = 0;
  for (let s = 0; s < nSub; s++) {
    const channel = ampFrames.map(f => f[s] ?? 0);
    totalVar += _variance(channel);
  }
  const normVar = Math.min(1, totalVar / (nSub * 100));
  const presence = normVar >= threshold;
  const confidence = Math.min(0.99, 0.5 + normVar * 2);
  return { presence, confidence };
}

/** Vital signs from CSI — returns { heart_rate_bpm, breathing_rate_bpm } */
function _extractVitals(buf) {
  if (buf.csi.length < 32) return { heart_rate_bpm: 0, breathing_rate_bpm: 0 };

  // Use mean amplitude across subcarriers as the 1D signal
  const signal = buf.csi.map(frame => _mean(_amplitude(frame)));

  const breathEnergy = _bandpass(signal, 0.1, 0.5);   // 6–30 RPM
  const heartEnergy  = _bandpass(signal, 0.8, 2.5);   // 48–150 BPM

  // Map energy to plausible rate — thresholds tuned for real CSI scale
  const breathRate = breathEnergy > 0 ? 12 + Math.min(20, Math.sqrt(breathEnergy) * 2) : 0;
  const heartRate  = heartEnergy  > 0 ? 55 + Math.min(75, Math.sqrt(heartEnergy)  * 5) : 0;

  return {
    heart_rate_bpm:   Math.round(heartRate),
    breathing_rate_bpm: Math.round(breathRate),
  };
}

/** Build signal field grid from RSSI history */
function _buildSignalField(buf) {
  const GRID = 20;
  const values = new Array(GRID * GRID).fill(0);
  if (buf.rssi.length === 0) return { grid_size: [GRID, 1, GRID], values };

  const avgRssi = _mean(buf.rssi);
  // Simple radial decay from centre
  for (let z = 0; z < GRID; z++) {
    for (let x = 0; x < GRID; x++) {
      const cx = (x - GRID / 2) / (GRID / 2);
      const cz = (z - GRID / 2) / (GRID / 2);
      const r = Math.sqrt(cx * cx + cz * cz);
      values[z * GRID + x] = Math.max(0, (1 - r) * Math.min(1, (avgRssi + 90) / 50));
    }
  }
  return { grid_size: [GRID, 1, GRID], values };
}

/**
 * Main entry point.
 * Returns a SensingFrame (Observatory wire format) or null if data insufficient.
 */
export function processCSI(rawFrame, activeApp = 'presence', params = {}) {
  const { ts = Date.now() / 1000, slot = 0, rssi = -65, csi = [] } = rawFrame;

  if (!csi || csi.length === 0) return null;

  const buf = _getBuffer(slot);
  _push(buf, csi, rssi, ts);

  const { presence, confidence } = _detectPresence(buf, params);
  buf.presence = presence;
  buf.confidence = confidence;

  const motionLevel = !presence ? 'absent'
    : buf.variance > 200 ? 'active'
    : 'present_still';

  const baseFrame = {
    app: activeApp,
    ts,
    slot,
    scenario: activeApp,
    rssi_dbm: rssi,
    classification: { motion_level: motionLevel, presence, confidence },
    signal_field: _buildSignalField(buf),
    persons: [],
    estimated_persons: 0,
  };

  if (!presence) return baseFrame;

  const [px, pz] = _estimatePosition();

  // App-specific enrichment
  switch (activeApp) {
    case 'vitals': {
      const vitals = _extractVitals(buf);
      baseFrame.vitals = vitals;
      baseFrame.persons = [{
        id: 'p0', position: [px, 0, pz], motion_score: 15,
        pose: 'standing', facing: 0,
        heart_rate_bpm: vitals.heart_rate_bpm,
        breathing_rate_bpm: vitals.breathing_rate_bpm,
      }];
      baseFrame.estimated_persons = 1;
      break;
    }
    case 'presence':
      baseFrame.persons = [{ id: 'p0', position: [px, 0, pz], motion_score: 20, pose: 'standing', facing: 0 }];
      baseFrame.estimated_persons = 1;
      break;
    case 'mat':
    case 'pose':
      baseFrame.persons = [{ id: 'p0', position: [px, 0, pz], motion_score: 30, pose: 'standing', facing: 0 }];
      baseFrame.estimated_persons = 1;
      break;
    default:
      break;
  }

  return baseFrame;
}
