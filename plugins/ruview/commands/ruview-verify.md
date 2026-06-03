---
name: ruview-verify
skill: witness-verification
description: >
  Run the full test suite, generate a deterministic Merkle proof for a sensing
  session, and emit a signed witness bundle for audit or compliance.
usage: /ruview-verify [--session <id>] [--key <pem-path>] [--submit <url>]
examples:
  - /ruview-verify
  - /ruview-verify --session sess_abc123
  - /ruview-verify --session sess_abc123 --key keys/signing.pem
  - /ruview-verify --session sess_abc123 --submit https://witness.example.com/submit
---

Invoke the **witness-verification** skill. Run `npm test` first. If
`--session` is provided, seal that session and generate the witness bundle.
If `--key` is provided use it for signing; otherwise remind the user to
generate a key first. If `--submit` is provided, submit the bundle after
generation.
