# Product Backlog & Out-of-Scope Ideas (C8)

> **Rule C8**: Do exactly what the specification states. Feature ideas or architectural extensions outside the immediate spec are recorded here for post-v1 evaluation, rather than introduced into active sprint code.

---

## 1. Post-v1 Feature Ideas

- **[BL-001] Peer-to-Peer Agent Communications**: Direct agent-to-agent delegation without intermediate orchestrator dispatching.
- **[BL-002] Multi-Tenant Organization Support**: Ability to manage multiple separate Telegram Mini App offices with distinct Telegram bot credentials and SQLite databases.
- **[BL-003] Automated VPS Profile Provisioning**: Direct SSH or Ansible agent profile creation on the VPS host (currently deliberately disabled in v1 for security; owner runs commands manually via the Hiring Package).
- **[BL-004] Voice Note Task Assignments**: Speech-to-text integration allowing the CEO to assign tasks via Telegram voice messages.
- **[BL-005] Biometric Approval Confirmations**: Native WebAuthn / FaceID confirmation for high-stakes financial approvals inside the Mini App.
