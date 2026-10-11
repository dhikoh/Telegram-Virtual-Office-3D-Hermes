# Hermes Agent Facts & Integration Reference

Documented and verified against official Hermes Agent documentation:
- [API Server Features](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server)
- [Programmatic Integration](https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration)
- [Profiles: Running Multiple Agents](https://hermes-agent.nousresearch.com/docs/user-guide/profiles)

Last updated: Phase 0 Reconnaissance.

---

## 1. Verified Architecture & Server Runtime

- **Command to Start Gateway**:
  ```bash
  hermes gateway
  ```
  Starts the gateway API server.
- **Default Network Binding**:
  Listens on `http://127.0.0.1:8642` (loopback only by default).
- **Core Configuration (`config.yaml`)**:
  ```yaml
  gateway:
    api_server:
      enabled: true
      port: 8642
      host: 127.0.0.1
      key: your-secret-key
      cors_origins: http://localhost:3000
      model_name: hermes-agent
      max_concurrent_runs: 10
  ```

---

## 2. Multi-Profile Architecture

- **Profile Isolation**:
  Profiles live in `~/.hermes/profiles/<name>/`. Each profile maintains independent `config.yaml`, `.env`, `SOUL.md`, memory, sessions, skills, cron, and gateway state.
  *Note: Profiles isolate configuration and memory, but do NOT provide an OS sandbox.*
- **Profile Creation**:
  ```bash
  hermes profile create <name> [--description "Description"]
  ```
- **Configuring Multi-Agent Ports**:
  API server settings can be overridden via environment variables in each profile's `.env` (`~/.hermes/profiles/<name>/.env`):
  ```bash
  API_SERVER_ENABLED=true
  API_SERVER_PORT=8643
  API_SERVER_KEY=<profile-secret-key>
  ```
- **Starting a Profile Gateway**:
  ```bash
  hermes -p <name> gateway &
  ```
- **SOUL.md Behavior**:
  Changes to `SOUL.md` take effect upon starting NEW sessions. Existing active sessions retain their initialized prompt context.

---

## 3. Verified Authentication

- **Auth Method**: HTTP Bearer Token.
- **Header**:
  ```http
  Authorization: Bearer <API_SERVER_KEY>
  ```
- **Verification**:
  Confirmed by `GET /v1/capabilities`:
  ```json
  "auth": {
    "type": "bearer",
    "required": true
  }
  ```

---

## 4. Verified API Endpoints

### 4.1 Discovery & Health
- `GET /health` and `GET /health/detailed`: Check gateway service health.
- `GET /v1/models`: Returns available models (e.g. `hermes-agent` or profile name).
- `GET /v1/capabilities`: Feature flags:
  ```json
  {
    "object": "hermes.api_server.capabilities",
    "platform": "hermes-agent",
    "model": "hermes-agent",
    "auth": { "type": "bearer", "required": true },
    "features": {
      "chat_completions": true,
      "responses_api": true,
      "run_submission": true,
      "run_status": true,
      "run_events_sse": true,
      "run_stop": true,
      "run_approval": true,
      "reasoning_streaming": true
    }
  }
  ```

### 4.2 Chat Completions
- `POST /v1/chat/completions`: Standard OpenAI Chat Completions endpoint. Supports `stream: true` with Server-Sent Events (SSE). Emits `hermes.tool.progress` custom events during streaming.

### 4.3 Runs API (Background / Managed Execution)
- `POST /v1/runs`:
  - **Status Code**: `202 Accepted`
  - **Request Body**:
    ```json
    {
      "input": "Task prompt or instruction",
      "session_id": "optional-session-id",
      "instructions": "optional-override-instructions",
      "conversation_history": []
    }
    ```
  - **Optional Header**: `Idempotency-Key: <unique-key>` for idempotent retries.
  - **Response Body**:
    ```json
    {
      "run_id": "run_abc123",
      "status": "started"
    }
    ```
- `GET /v1/runs/{id}`:
  - **Response Body**:
    ```json
    {
      "object": "hermes.run",
      "run_id": "run_abc123",
      "status": "completed",
      "session_id": "...",
      "model": "hermes-agent",
      "output": "Result markdown or text",
      "usage": {
        "input_tokens": 50,
        "output_tokens": 200,
        "total_tokens": 250,
        "cache_read_tokens": 40,
        "cache_write_tokens": 0
      }
    }
    ```
  - **Possible statuses**: `started`, `running`, `waiting_for_approval`, `completed`, `failed`, `cancelled`, `interrupted`.
- `GET /v1/runs/{id}/events`:
  - SSE stream (`Content-Type: text/event-stream`).
  - Event types:
    - `tool.started`: `{ "tool": "name", "preview": "args" }`
    - `tool.completed`: `{ "tool": "name", "duration": 1.2, "error": false, "preview": "output" }`
    - `message.interim`: `{ "text": "...", "already_streamed": false }`
    - `message.delta`: Token streaming chunks.
    - `approval.request`: Surfaces when a tool or MCP gate requires human consent. Run pauses with status `waiting_for_approval`.
    - `run.completed`: Terminal success event.
    - `run.failed`: Terminal error event.
    - `run.cancelled`: Terminal cancellation event.
- `POST /v1/runs/{id}/approval`:
  - Resolves pending approval.
  - **Request Body**:
    ```json
    {
      "decision": "once"
    }
    ```
    or
    ```json
    {
      "decision": "deny"
    }
    ```
- `POST /v1/runs/{id}/stop`:
  - Interrupts running agent turn.
  - Returns `{"status": "stopping"}`. Settles to `cancelled`.

---

## 5. Items Requiring On-VPS Verification // TODO(verify)

The following items are confirmed in documentation, but must be checked on the owner's specific live deployment:
1. `// TODO(verify)` Exact version of `hermes-agent` installed on the host.
2. `// TODO(verify)` The active host port and API key configured for Hermes on the owner's machine.
3. `// TODO(verify)` Exact SSE framing (e.g. `event: <name>\ndata: <json>\n\n`) on live run events stream.
4. `// TODO(verify)` Host network accessibility from Docker container via `host.docker.internal` or bridge IP `172.17.0.1`.
