---
name: witness-verification
description: >
  Run the RuView test suite, produce a deterministic cryptographic proof of a
  sensing session, and emit a signed witness bundle suitable for audit,
  regulatory compliance, or third-party verification.
trigger: /ruview-verify
---

# Tests, Proofs, and Witness Verification

## Test suite

```bash
# Full suite
npm test

# Unit only (fast, no hardware needed)
npm run test:unit

# Integration (requires running server)
npm run test:integration

# E2E with simulated CSI data
npm run test:e2e
```

CI gate thresholds (enforced in `jest.config.js`):
- Line coverage ≥ 80 %
- All tests green
- Model eval: accuracy ≥ 0.90, F1 ≥ 0.88 (re-checked on every train)

### Running a specific test file

```bash
npx jest tests/sensing/presence.test.ts --verbose
```

---

## Deterministic proof

A **deterministic proof** is a SHA-256 Merkle root over an ordered sequence of
CSI frames + inference outputs, ensuring the sensing record cannot be tampered
with after the fact.

### 1 — Capture a session with proof enabled

```bash
curl -X POST http://localhost:3000/api/session/start \
  -d '{"app": "presence", "prove": true}'
```

The server writes frames to an append-only ledger file:
`~/.ruview/sessions/<session-id>/ledger.ndjson`

### 2 — Seal the session

```bash
curl -X POST http://localhost:3000/api/session/<session-id>/seal
```

Response:

```json
{
  "session_id": "sess_abc123",
  "frame_count": 3600,
  "merkle_root": "a3f8c2d1e9b0...",
  "sealed_at": "2026-06-03T12:00:00Z",
  "algorithm": "sha256-merkle"
}
```

### 3 — Verify locally

```bash
npx ruview verify --session sess_abc123
# → ✓ Merkle root matches: a3f8c2d1e9b0...
# → ✓ Frame count: 3600
# → ✓ No gaps or reordering detected
```

---

## Witness bundle

A witness bundle packages the sealed proof with device attestation and
optional third-party countersignature for audit purposes.

### Generate

```bash
npx ruview witness create \
  --session sess_abc123 \
  --signer  keys/signing.pem \
  --out     witness/sess_abc123.bundle.json
```

Bundle schema:

```json
{
  "schema":     "ruview-witness/1.0",
  "session_id": "sess_abc123",
  "merkle_root":"a3f8c2d1e9b0...",
  "frame_count": 3600,
  "sealed_at":  "2026-06-03T12:00:00Z",
  "device_attestation": {
    "esp32_chip_id": "ABC123DEF456",
    "firmware_sha256": "deadbeef...",
    "provisioned_at": "2026-06-01T08:00:00Z"
  },
  "signature": {
    "algorithm": "ecdsa-p256-sha256",
    "public_key": "MFkwEwYH...",
    "value": "MEUCIQD..."
  }
}
```

### Verify a bundle

```bash
npx ruview witness verify witness/sess_abc123.bundle.json
# → ✓ Signature valid
# → ✓ Merkle root consistent with ledger
# → ✓ Device attestation matches provisioning record
```

### Submit to external witness service (optional)

```bash
npx ruview witness submit \
  --bundle  witness/sess_abc123.bundle.json \
  --service https://witness.example.com/submit
```

The service returns a countersignature that can be appended to the bundle for
chain-of-custody continuity.

---

## Key generation

```bash
# Generate an ECDSA P-256 signing key
openssl ecparam -genkey -name prime256v1 -noout -out keys/signing.pem
openssl ec -in keys/signing.pem -pubout -out keys/signing.pub.pem
```

Keep `keys/signing.pem` out of version control (add to `.gitignore`).
