---
name: ruview-advanced
skill: advanced-sensing
description: >
  Configure and run advanced multi-node sensing: multistatic radar,
  WiFi tomography, cross-viewpoint fusion, and mesh security monitoring.
  Requires ≥ 2 provisioned nodes.
usage: /ruview-advanced [multistatic|tomo|crossview|security]
examples:
  - /ruview-advanced
  - /ruview-advanced multistatic
  - /ruview-advanced tomo
  - /ruview-advanced security
---

Invoke the **advanced-sensing** skill. If a mode argument is given skip the
mode-selection step and jump to that section. Otherwise present the four modes
and ask which to configure. Verify that ≥ 2 nodes are provisioned before
proceeding with any multi-node configuration.
