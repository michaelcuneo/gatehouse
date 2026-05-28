# gatehouse

# Gatehouse

Infrastructure Runtime + AWS Orchestration Platform

---

# Overview

Gatehouse is a self-hosted infrastructure orchestration platform built with:

- SvelteKit
- TypeScript
- SQLite initially
- AWS SDK v3
- NGINX
- Local runtime orchestration

The platform is designed to manage:

- reverse proxy routing
- static site hosting
- internal services
- AWS Route53 DNS
- AWS S3 storage
- SSL certificates
- deployment infrastructure
- local machine runtime state

The system is NOT Kubernetes.

The system is NOT a distributed control plane.

The system is a local infrastructure runtime platform that owns and orchestrates infrastructure resources declaratively.

---

# Core Philosophy

Gatehouse is built around:

```txt
Resources
→ Providers
→ Reconciliation
→ Runtime
```

The platform is declarative.

Users define desired infrastructure state.

Providers reconcile real infrastructure into that desired state.

---

# Architecture Principles

## 1. Declarative Infrastructure

The database stores desired state.

Providers reconcile runtime state.

Infrastructure is generated from structured resources.

---

## 2. Generated Infrastructure

Gatehouse NEVER stores raw nginx configs.

Instead:

```txt
Resource
→ Renderer
→ Generated Runtime Config
```

Generated configs are deterministic.

Same input → same output.

---

## 3. Runtime Ownership

Gatehouse owns its own runtime directory.

NGINX consumes Gatehouse-generated configs.

Gatehouse does NOT integrate itself into nginx system architecture.

Instead nginx includes Gatehouse runtime configs.

---

## 4. Separation of Concerns

The system separates:

```txt
Validation
Rendering
Runtime Application
Reconciliation
Persistence
```

These are independent systems.

---

# Runtime Architecture

## Runtime Layout

```txt
runtime/
├── generated/
│   ├── nginx/
│   ├── certs/
│   └── state/
│
├── templates/
│   └── nginx/
│
├── bin/
│
└── install/
    ├── linux/
    ├── macos/
    └── docker/
```

---

# NGINX Integration

NGINX includes Gatehouse-generated configs:

```nginx
include /path/to/runtime/generated/nginx/*.conf;
```

Gatehouse owns:

- generation
- rendering
- runtime files

NGINX merely consumes them.

---

# Core Resource System

Gatehouse is built around generic resources.

## Resource Flow

```txt
Resource
    ↓
Validation
    ↓
Provider Resolution
    ↓
Reconciliation
    ↓
Renderer
    ↓
Runtime Application
```

---

# Base Resource Model

All resources derive from:

```ts
BaseResource<TKind, TSpec>;
```

Resources contain:

- metadata
- desired state
- runtime state
- reconciliation status
- provider ownership

---

# Current Resource Types

## Endpoint

Represents:

- reverse proxy routes
- static sites

### Reverse Proxy

```txt
api.example.com
    ↓
localhost:3001
```

### Static Site

```txt
app.example.com
    ↓
/srv/sites/app
```

---

## Service

Represents:

- node services
- bun services
- docker services
- binaries

Services may later support:

- lifecycle management
- monitoring
- deployments

---

## Certificate

Represents:

- SSL certificates
- wildcard certificates
- ACM certificates

---

## DNS Record

Represents:

- Route53 records
- DNS state

---

## Storage Bucket

Represents:

- local storage
- S3 buckets

---

## Static Site

Represents:

- deployable static sites
- S3 deployment targets
- local static deployment

---

# Resource Providers

Providers reconcile infrastructure.

Current planned providers:

```txt
providers/
├── nginx/
├── filesystem/
├── aws/
│   ├── route53/
│   ├── s3/
│   └── acm/
```

---

# Provider Architecture

Each provider contains:

```txt
validate.ts
render.ts
runtime.ts
reconcile.ts
```

## validate.ts

Ensures resource validity.

## render.ts

Pure deterministic rendering.

NO IO.

## runtime.ts

Performs filesystem/system mutations.

## reconcile.ts

Coordinates:

- validation
- rendering
- runtime application

---

# Reconciliation System

The reconciliation engine resolves:

- resource kind
- provider
- dependency order

Then invokes the correct provider reconciler.

---

# Dependency System

Resources may depend on other resources.

Example:

```txt
Endpoint
    depends on
Certificate
    depends on
DNS Record
```

The reconciliation engine will eventually reconcile resources in dependency order.

---

# Runtime State

Resources contain runtime state separately from desired state.

Examples:

- last reconciliation
- health
- last error
- status messages

This prevents mixing:

- desired configuration
- live runtime state

---

# Database

Initial database:

- SQLite
- single `resources` table

Resources store:

- metadata
- spec
- runtime state
- provider
- status

Specs are initially stored as JSON.

Normalization may occur later.

---

# SvelteKit Architecture

Gatehouse is built server-first.

All infrastructure logic lives in:

```txt
src/lib/server/
```

Frontend UI remains thin.

---

# Current Planned Structure

```txt
src/
├── lib/
│   └── server/
│       ├── core/
│       ├── db/
│       ├── providers/
│       ├── reconciliation/
│       ├── resources/
│       ├── runtime/
│       └── shell/
│
├── routes/
│
└── types/
    └── ambient.d.ts
```

---

# Shell Execution

All system commands flow through:

```txt
shell/
├── exec.ts
├── sudo.ts
└── spawn.ts
```

This centralizes:

- process execution
- logging
- permissions
- error handling

---

# Installation Philosophy

Gatehouse installs itself.

Users should NOT:

- manually edit nginx
- manually edit sudoers
- manually create runtime dirs

Instead:

```bash
bun run install
```

should:

- initialize runtime
- initialize DB
- install runtime files
- configure integrations
- verify environment

---

# Security Philosophy

Infrastructure access is tightly scoped.

The app itself should not run fully privileged.

Runtime helpers should be isolated and minimal.

---

# Current Scope

The immediate goal is:

```txt
Create endpoint
    ↓
Persist resource
    ↓
Reconcile resource
    ↓
Generate nginx config
    ↓
Reload nginx
    ↓
Route becomes live
```

---

# Future Planned Features

## AWS Integration

- Route53
- S3
- ACM
- CloudFront

---

## Local Infrastructure

- nginx orchestration
- filesystem management
- service management
- static hosting

---

## Deployment Features

- static deployments
- S3 sync
- CloudFront invalidation
- service deployments

---

## Monitoring

- health checks
- reconciliation status
- runtime diagnostics
- audit logs

---

# Non-Goals

Gatehouse is NOT:

- Kubernetes
- a distributed control plane
- a cluster orchestrator
- a service mesh

The platform is intentionally:

- local-first
- deterministic
- infrastructure-focused
- lightweight

---

# Current Status

Architecture phase.

Core systems defined:

- resource system
- provider system
- reconciliation architecture
- runtime ownership model
- nginx ownership model
- runtime directory structure

Next step:
implement core runtime and reconciliation engine.
