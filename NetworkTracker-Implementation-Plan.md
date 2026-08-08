# NetworkTracker Implementation Plan (Revised)

This is the full architecture and implementation plan for NetworkTracker — a microservices system combining a Spring Boot backend, Python FastAPI AI services, a React frontend, and supporting infrastructure. This version incorporates a full architecture review: contract-first design, real-time data handling, service-to-service security, resilience, observability, and a proper testing strategy.

---

## 1. Guiding Principles

- **Contract-first**: no service is built against another service's *assumed* behavior. APIs are specified before implementation.
- **Fail loud, fail fast, recover gracefully**: every cross-service call has a timeout, retry policy, and fallback.
- **Real-time where it matters**: congestion alerts are pushed, not polled.
- **Observability from day one**: logs, metrics, and traces are wired in during infrastructure setup, not bolted on at the end.
- **Everything runs in Docker**: local dev environment matches (as closely as possible) what ships.

---

## 2. System Architecture Overview

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────────────┐
│   React     │◄────►│   Spring Boot     │◄────►│   FastAPI Services   │
│  Frontend   │ REST │   Gateway/Core    │ REST │ (RAG / Forecast /    │
│  (Vite)     │ +WS  │  (Auth, Routing,  │ +gRPC│  Congestion)         │
└─────────────┘      │   Resilience)     │      └─────────────────────┘
                      └────────┬──────────┘               │
                               │                            │
                 ┌─────────────┼────────────────┬───────────┘
                 ▼             ▼                ▼
           ┌──────────┐  ┌──────────┐   ┌──────────────┐
           │ Keycloak │  │TimescaleDB│   │  ChromaDB     │
           │  (Auth)  │  │+ Postgres │   │ (Vector Store)│
           └──────────┘  └──────────┘   └──────────────┘
                               │
                 ┌─────────────┴─────────────┐
                 ▼                            ▼
           ┌──────────┐               ┌──────────────┐
           │  Kafka /  │               │ Elasticsearch │
           │ RabbitMQ  │──────────────►│  + Kibana +   │
           │ (Streaming)│              │  OpenTelemetry│
           └──────────┘               └──────────────┘
```

**Key architectural decisions:**
1. Spring Boot is the single entry point for the frontend — it owns auth validation, routing, and resilience policy toward FastAPI.
2. Real-time congestion data flows through a message broker, not synchronous polling.
3. Time-series traffic data lives in TimescaleDB (a Postgres extension), not vanilla Postgres.
4. Every service ships logs to Elasticsearch and traces to a tracing backend (Jaeger via OpenTelemetry).

---

## 3. Open Questions — Resolved Defaults

If you don't override these, the plan proceeds with the following defaults:

| Question | Default Decision | Rationale |
|---|---|---|
| Keycloak instance | Spin up via Docker Compose | No reason to manage it separately in dev |
| AI models (forecasting/congestion) | Start with placeholder models behind the real API contract | Decouples model readiness from system integration |
| Network traffic data source | Build a synthetic data simulator service | Lets every downstream service be built and tested immediately |

---

## 4. Proposed Implementation Phases

### Phase 0: API Contracts & Service Interfaces (NEW — do this first)

**Goal:** No implementation work starts until the shape of every cross-service call is written down and agreed on.

#### [NEW] `contracts/`
- `openapi/rag-service.yaml` — RAG chatbot endpoint contract (request/response schema, error codes)
- `openapi/forecast-service.yaml` — Time-series forecasting endpoint contract
- `openapi/congestion-service.yaml` — Congestion detection endpoint contract
- `openapi/gateway-api.yaml` — Spring Boot's public-facing API for the frontend
- `events/congestion-alert.schema.json` — Event schema for real-time congestion alerts (topic/queue message format)
- `asyncapi/streaming.yaml` — AsyncAPI spec describing the Kafka/RabbitMQ topics, producers, and consumers

**Why this matters:** Phase 2 (Spring Boot) needs to build routes to FastAPI services that don't exist yet in Phase 3. With contracts defined first, both sides can build against mocks in parallel instead of blocking each other.

**Tooling:**
- Use [Prism](https://github.com/stoplightio/prism) or WireMock to stand up mock servers from the OpenAPI specs.
- Validate all specs in CI with `spectral lint`.

**Deliverable checklist:**
- [ ] All 4 OpenAPI specs reviewed and merged
- [ ] Event/message schema defined for streaming data
- [ ] Mock servers running and reachable from both backend and AI-service dev environments

---

### Phase 1: Infrastructure & Databases (Docker Compose)

**Goal:** A consistent, one-command local environment with health checks so services don't race each other on startup.

#### [NEW] `docker-compose.yml`

Services:
- **Keycloak** — Auth/identity provider (OAuth2/OIDC)
- **PostgreSQL** — Relational data (user preferences, app metadata)
- **TimescaleDB** *(new — replaces plain Postgres for traffic data)* — time-series network traffic data; it's a Postgres extension, so tooling/ORMs stay the same, but you get hypertables, retention policies, and continuous aggregates for free
- **ChromaDB** — Vector database for RAG
- **Kafka (or RabbitMQ)** *(new)* — message broker for real-time traffic/congestion events
- **Elasticsearch & Kibana** — centralized logging
- **Jaeger** *(new)* — distributed tracing backend (via OpenTelemetry Collector)
- **Network Data Simulator** *(new — see Phase 3a)* — generates synthetic traffic data and publishes it to Kafka/RabbitMQ

#### Requirements for every service definition
- `healthcheck` block (e.g., `pg_isready`, Keycloak's `/health/ready`, Kafka broker check)
- `depends_on` with `condition: service_healthy` (not just `service_started`) — prevents Spring Boot from booting before Postgres/Keycloak are actually ready
- Named volumes for all stateful services (Postgres, TimescaleDB, ChromaDB, Elasticsearch) so data survives `docker-compose down`
- A dedicated Docker network (`networktracker-net`) shared by all services

**Deliverable checklist:**
- [ ] `docker-compose up` brings up all infra services cleanly with no manual ordering
- [ ] All services report healthy within a reasonable timeout
- [ ] Kafka/RabbitMQ topic(s) created and reachable
- [ ] Kibana and Jaeger UIs accessible locally

---

### Phase 2: Main Coordinator (Spring Boot Backend)

**Goal:** Central orchestrator that authenticates users, routes requests to AI services, and does so resiliently.

#### [NEW] `backend/` (Spring Boot Project)

**Security**
- Integrate Keycloak for OAuth2/OIDC authentication (Spring Security + `spring-boot-starter-oauth2-resource-server`)
- Validate JWTs on every incoming request
- **Service-to-service auth (new — was previously undefined):** Spring Boot authenticates to FastAPI using OAuth2 client-credentials flow against Keycloak (a dedicated `internal-service` client). This avoids relying on "trust the Docker network" as a security model, which doesn't hold up outside local dev.

**API Gateway / Routing**
- Build endpoints that proxy to FastAPI services, matching the contracts defined in Phase 0
- Use Spring Cloud Gateway or plain `WebClient`-based routing, depending on team preference

**Resilience (new)**
- Integrate **Resilience4j**:
  - Circuit breakers around every FastAPI call
  - Configurable timeouts per downstream service
  - Retry policy with exponential backoff for transient failures
  - Fallback responses (e.g., cached last-known forecast) when a downstream service is unavailable
- Without this, one slow FastAPI call hangs the whole gateway — this is not optional for a microservices system.

**Real-time layer (new)**
- Expose a WebSocket (or SSE) endpoint for the frontend to subscribe to congestion alerts
- Spring Boot consumes congestion events from Kafka/RabbitMQ and pushes them to connected clients
- This replaces polling as the mechanism for "real-time" alerts

**Data Management**
- Connect to PostgreSQL for user preferences and application metadata
- Connect to TimescaleDB (read path) for serving historical traffic queries to the frontend, where relevant

**Observability**
- Structured JSON logging shipped to Elasticsearch
- OpenTelemetry SDK integrated for distributed tracing (propagate trace context on every call to FastAPI)

**Deliverable checklist:**
- [ ] Keycloak login flow validated end-to-end with a test user
- [ ] Service-to-service auth working against mock FastAPI (from Phase 0)
- [ ] Circuit breaker demonstrably trips when a downstream mock is killed
- [ ] WebSocket endpoint pushes a test event to a connected client
- [ ] Logs visible in Kibana, traces visible in Jaeger

---

### Phase 3: Specialist Team (Python/FastAPI AI Services)

**Goal:** Build the AI microservices against the Phase 0 contracts, so they're interchangeable with the mocks Spring Boot was built against.

#### [NEW] `ai-services/` (FastAPI Project)

**RAG Chatbot Service**
- Integrate LangChain and ChromaDB to ingest network logs and answer natural-language queries
- Ingestion pipeline: logs → chunking → embedding → ChromaDB upsert
- Query pipeline: user question → retrieval → prompt construction → LLM call → response
- Return structured responses matching `openapi/rag-service.yaml` (not free-text-only — include source citations/log references where possible)

**Time-Series Forecasting Service**
- Endpoint receives historical traffic data, returns future predictions
- **v1:** placeholder model (e.g., simple moving average or Prophet) behind the real API contract, so the rest of the system can integrate immediately
- **v2:** swap in a Transformer-based model (e.g., a temporal fusion transformer) once placeholder is validated end-to-end
- Model swap should require zero changes to the API contract or to consumers

**Congestion Detection Service**
- Analyzes real-time data chunks (consumed from Kafka/RabbitMQ) for anomalies
- **v1:** placeholder/statistical anomaly detection (e.g., z-score or IQR-based thresholding)
- **v2:** upgrade to a trained anomaly-detection model
- On detecting congestion, publishes an event to the message broker (matches `events/congestion-alert.schema.json`), which Spring Boot consumes and pushes to the frontend via WebSocket

#### [NEW] `ai-services/simulator/` — Network Data Simulator (new, addresses "Data Source" open question)
- A small standalone service/script that generates synthetic network traffic data at a configurable rate
- Publishes to the same Kafka/RabbitMQ topic real traffic data would use
- Built so it can be swapped out for a real data ingestion pipeline later without touching any downstream service — this is the key benefit of resolving the "data source" question this way

**Observability**
- Structured JSON logging shipped to Elasticsearch
- OpenTelemetry instrumentation for FastAPI (trace propagation from Spring Boot through to model inference)

**Deliverable checklist:**
- [ ] All 3 services match their OpenAPI contracts exactly (validated via contract tests)
- [ ] RAG service returns cited answers from ingested logs
- [ ] Forecasting service returns predictions in the agreed schema
- [ ] Congestion service publishes valid events to the broker
- [ ] Simulator produces a continuous, configurable stream of synthetic data

---

### Phase 4: Frontend Dashboard (React)

**Goal:** A dashboard that consumes REST for on-demand data and WebSocket/SSE for live alerts, without the usual state-management sprawl.

#### [NEW] `frontend/` (React Project)

**Setup**
- Initialize with Vite
- UI library: confirm preference (Material-UI vs Tailwind CSS) — default to Tailwind + a component primitive library (e.g., shadcn/ui) if no preference given, for flexibility without heavy theming overhead

**Authentication**
- Integrate Keycloak login flow (`keycloak-js` adapter or `react-oidc-context`)
- Store and refresh tokens; attach to every request to the Spring Boot gateway

**Data fetching & state (new — was previously unspecified)**
- Use **TanStack Query (React Query)** for all REST calls to the gateway (forecast data, chat history, historical traffic)
  - Gives caching, background refresh, retry, and loading/error states without hand-rolled `useState`/`useEffect` chains
- Use a lightweight WebSocket hook (or `socket.io-client`/native `EventSource` for SSE) for the live congestion alert stream, feeding into a small store (React context or Zustand) that the dashboard subscribes to

**Dashboard UI**
- Traffic forecast chart (e.g., Recharts or Chart.js)
- Real-time congestion alert panel (updates live via the WebSocket connection, not polling)
- Chat interface for the RAG bot (streaming responses if the backend supports SSE-based streaming from the LLM)

**Deliverable checklist:**
- [ ] Login flow works end-to-end against Keycloak
- [ ] Forecast chart renders data fetched via React Query, with visible loading/error states
- [ ] Congestion alerts appear in the UI within seconds of the simulator producing an anomalous event, with no polling involved
- [ ] Chat interface successfully round-trips a query to the RAG service and displays the answer with sources

---

### Phase 5: Integration & Containerization

**Goal:** Every custom service is containerized, wired into the shared infrastructure, and produces logs and traces that show up centrally.

#### [NEW] `backend/Dockerfile`, `ai-services/Dockerfile`, `frontend/Dockerfile`, `ai-services/simulator/Dockerfile`
- Multi-stage builds for each (build stage + slim runtime stage)
- Non-root users in final images
- Update `docker-compose.yml` to include Spring Boot, FastAPI, React, and the simulator, all attached to `networktracker-net`
- Add `healthcheck` blocks to the custom services too, not just infra services

**Configuration**
- Centralize environment-specific config via `.env` files per environment (never commit secrets — use `.env.example` as the template)
- Spring Boot and FastAPI both configured to ship logs to Elasticsearch (Filebeat sidecar or direct shipping via a logging appender)
- Both configured to export traces to the OpenTelemetry Collector → Jaeger

**Deliverable checklist:**
- [ ] `docker-compose up` brings up the entire stack — infra + all custom services — with one command
- [ ] All services pass their health checks
- [ ] A single request from the frontend produces a connected trace spanning React → Spring Boot → FastAPI → (ChromaDB/model) in Jaeger
- [ ] Logs from all 3 custom services are searchable in Kibana

---

## 5. Verification Plan

### Automated Tests

**Spring Boot**
- Unit tests for routing logic and Keycloak token validation
- **Integration tests using Testcontainers (new)** — spin up real Postgres, TimescaleDB, and Keycloak containers in the test suite instead of mocking them, to catch real config/connection issues before they hit staging
- Circuit breaker behavior tests (simulate downstream failure, assert fallback triggers)

**FastAPI**
- Pytest unit tests for each endpoint, asserting response shape matches the OpenAPI contract
- Contract tests that validate live responses against the `openapi/*.yaml` specs (e.g., using `schemathesis`)

**Frontend**
- Component tests for dashboard widgets (React Testing Library)
- A test for the WebSocket hook confirming it updates UI state when a mock event is received

**Cross-service (new)**
- A docker-compose-based smoke test run in CI: bring up the full stack, hit the gateway's public endpoints, assert 200s and expected shapes, then tear down. This is the test most likely to catch the class of bugs that unit tests miss (wrong contract, misconfigured auth, broken networking).

### Manual Verification
1. Spin up the entire stack using `docker-compose up`.
2. Access the React frontend at `http://localhost:3000` and successfully log in via Keycloak.
3. Ask a network question in the RAG Chatbot UI and verify the response is generated by the LangChain/ChromaDB pipeline, with source references shown.
4. View the dashboard and verify the forecasting and congestion components can successfully fetch data from the FastAPI services via the Spring Boot gateway.
5. **(New)** Let the Network Data Simulator run and confirm a congestion alert appears in the dashboard in real time (via WebSocket), without refreshing the page.
6. **(New)** Kill the FastAPI congestion service mid-session and confirm the gateway's circuit breaker trips gracefully (frontend shows a degraded-state message rather than hanging or crashing).
7. **(New)** Open Kibana and Jaeger and confirm a single user action (e.g., asking a chatbot question) is traceable end-to-end across all three services.

---

## 6. Summary of Changes From the Original Plan

| Area | Original | Revised |
|---|---|---|
| Phasing | Gateway (Phase 2) built before AI services exist (Phase 3) | New Phase 0 defines contracts first; Phases 2 & 3 build in parallel against mocks |
| Real-time alerts | Implied polling | WebSocket/SSE from Spring Boot, fed by Kafka/RabbitMQ events |
| Service-to-service auth | Undefined | OAuth2 client-credentials flow via Keycloak |
| Resilience | None specified | Resilience4j: circuit breakers, timeouts, retries, fallbacks |
| Traffic data storage | Plain PostgreSQL | TimescaleDB (Postgres extension) for time-series data |
| Observability | Logging only (ELK) | Logging + distributed tracing (OpenTelemetry + Jaeger) |
| Testing | Unit tests only | + Testcontainers integration tests + full-stack smoke tests in CI |
| Frontend data layer | Unspecified | TanStack Query for REST, dedicated hook/store for WebSocket state |
| Data source | Open question | Dedicated, swappable Network Data Simulator service |
| Docker Compose | No explicit health/ordering guarantees | `healthcheck` + `depends_on: condition: service_healthy` everywhere |

---

## 7. Suggested Order of Work

1. Phase 0 (contracts) — blocks everything else, keep it short but don't skip it
2. Phase 1 (infra) — can start in parallel with Phase 0 once topic/queue names are agreed
3. Phase 2 and Phase 3 — in parallel, both against Phase 0 mocks
4. Phase 4 — can start once Phase 2's gateway API is stable, even before Phase 3 is fully real (mocks again)
5. Phase 5 — once all services pass their own local health checks
6. Verification — continuously, not just at the end; smoke tests should run in CI from Phase 2 onward, not bolted on at the finish
