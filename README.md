# GateHouse

GateHouse is a self-hosted, local-first infrastructure runtime and AWS orchestration platform.

It stores desired infrastructure state locally, discovers existing AWS infrastructure, reconciles supported resources through providers, monitors health, records deployments and audit history, and provides explicit ownership/adoption workflows for infrastructure that already exists.

GateHouse is not Kubernetes, a distributed control plane, or a service mesh. It is intentionally small, deterministic, and designed to run close to the systems it manages.

## Status

GateHouse is currently **pre-release / dogfood-ready**.

The core control plane is implemented. Existing AWS estates can be discovered and imported read-only, supported resources can be dry-run before adoption, and GateHouse distinguishes its own resources from infrastructure still owned by CloudFormation, SST, CDK, or another external controller.

Public release should still be treated as pre-1.0 until the real-world dogfood/migration path has been exercised thoroughly.

## Architecture

The core flow is:

```text
Desired resources
      ↓
Dependency planning
      ↓
Provider reconciliation
      ↓
Runtime / AWS
      ↓
Health + deployment + audit state
```

Main workspace packages:

```text
packages/
├── types/            resource and provider contracts
├── core/             projects, stages and shared orchestration models
├── db/               SQLite persistence, backup and migration state
├── resources/        resource CRUD and desired-state versioning
├── providers/        provider implementations
├── reconciliation/   dependency planning, convergence and health
├── aws/              AWS SDK clients, discovery and AWS operations
├── runtime/          local runtime paths and maintenance coordination
└── observability/    operational/logging support

apps/
└── web/              SvelteKit control plane UI
```

## Resource model

Current first-class resource kinds include:

- endpoints
- services
- certificates
- DNS records
- storage buckets
- static sites
- database tables
- functions

Current providers include:

- NGINX
- filesystem
- systemd
- AWS Route53
- AWS S3
- AWS ACM
- AWS DynamoDB
- AWS Lambda

CloudFront delivery is modeled as part of an S3-backed static site rather than as a duplicate standalone resource.

## Reconciliation

GateHouse uses desired-state reconciliation rather than imperative infrastructure scripts.

The reconciliation engine:

- resolves dependencies
- detects dependency cycles and missing dependencies
- reconciles resources in dependency order
- tracks desired-state versions
- records deployment runs
- retries failed/unhealthy resources
- performs health checks
- automatically scans `deployOnChange` static sites
- fingerprints build output to avoid unnecessary uploads and CloudFront invalidations

The web runtime starts background health and reconciliation monitors automatically.

Useful environment variables:

```text
GATEHOUSE_RECONCILIATION_TICK_SECONDS
GATEHOUSE_DEPLOY_ON_CHANGE_SCAN_SECONDS
GATEHOUSE_RECONCILIATION_UNHEALTHY_RETRY_SECONDS
GATEHOUSE_RECONCILIATION_ERROR_RETRY_SECONDS
GATEHOUSE_RECONCILIATION_STALE_SECONDS
GATEHOUSE_HEALTH_MONITOR_TICK_SECONDS
```

## Ownership

Infrastructure ownership is explicit.

```text
observed
    GateHouse knows the resource exists but does not mutate it.

external
    Another controller owns it, such as CloudFormation, SST or CDK.

gatehouse
    GateHouse is the desired-state authority and may reconcile it.
```

Existing infrastructure is never made GateHouse-owned merely because discovery found it.

## AWS discovery and adoption

Each registered AWS stage has a Discovery view.

New and migrated AWS stages default to **read-only dogfood mode**. In this mode GateHouse can verify AWS access, refresh discovery, classify ownership, run read-only comparisons and export discovery reports, but it blocks imports, ownership transfer, stack-migration progression and AWS adoption mutations. Adoption must be explicitly enabled in Stage settings.

GateHouse currently discovers:

- CloudFormation stacks
- S3 buckets
- Route53 hosted zones and records
- ACM certificates
- CloudFront distributions
- Lambda functions
- DynamoDB tables

Discovery is read-only and persisted locally as a stage snapshot.

Discovery can also export a versioned read-only estate report containing the saved scan, ownership classification, adoption eligibility, dependency requirements and warnings. The report contains no AWS credentials and does not mutate AWS.

Supported resources can follow this flow:

```text
AWS discovery
    ↓
Import read-only
    ↓
Observed / External
    ↓
Dry run against live AWS
    ↓
Exact match
    ↓
Take control
    ↓
GateHouse-owned reconciliation
```

Unsupported or incompletely modeled resources remain inventory-only.

GateHouse intentionally refuses adoption when it cannot represent live state exactly enough to manage it safely.

## CloudFormation / SST / CDK migration

Children of externally managed stacks remain blocked from direct takeover.

GateHouse has a staged stack-migration workflow:

```text
prepared
    ↓
ready_for_detach
    ↓
retention_update_pending
    ↓
retention_applied
    ↓
detach_pending
    ↓
detached
```

Before a plain CloudFormation stack can be detached automatically, GateHouse verifies that:

- discovered children are represented
- imported children match live AWS
- the stack is plain CloudFormation
- the template is parseable JSON
- no Transform/macros are present
- no nested stack resources are present
- no custom resources are present
- termination protection is disabled

For supported stacks GateHouse applies `DeletionPolicy: Retain` and `UpdateReplacePolicy: Retain` before stack deletion, verifies those policies, requires exact stack-name confirmation, and then verifies retained AWS resources still exist after the stack disappears.

SST/CDK and other ambiguous stack ownership paths remain manual rather than being guessed.

## Safe lifecycle operations

Resource lifecycle actions distinguish local records from real infrastructure:

- **Relinquish** — stop GateHouse mutation and keep observing the resource.
- **Forget** — remove only the local GateHouse record for a non-owned resource.
- **Destroy** — destroy supported GateHouse-owned infrastructure only after dependency and confirmation checks.

Providers without a safe destructive workflow do not expose destruction.

## Projects and stages

Projects can contain multiple AWS stages.

A stage stores:

- AWS account ID
- primary and additional regions
- default-credential or STS assume-role access
- capability flags
- CloudWatch selectors
- diagnostics profile
- enabled/disabled state

AWS access is verified before new or changed stage settings are accepted.

Stages with attached resources cannot silently change AWS account identity.

## Backup and restore

Runtime → Backup exports the local GateHouse control plane as:

```text
gatehouse-state v1
```

The export contains:

- resources
- projects
- stages
- stage/resource links
- audit history
- deployment history
- AWS discovery snapshots
- AWS stack migration state

It does **not** contain AWS access keys or copy AWS infrastructure.

Restore:

- validates the backup format and columns
- pauses background runtime operations
- writes a timestamped pre-restore rollback backup under `data/backups/`
- replaces local control-plane tables transactionally
- resumes runtime monitoring afterward

Restore changes local GateHouse state only; it does not directly mutate AWS.

## Runtime data

By default GateHouse resolves its repository root automatically and stores:

```text
data/
└── app.db

runtime/
└── generated/
    ├── nginx/
    ├── certs/
    └── state/
```

Set `GATEHOUSE_ROOT` to override the resolved root directory.

Generated runtime state, SQLite data, package installs and build caches are excluded from Git.

## Development

Requirements:

- Node.js 22
- pnpm 9
- AWS credentials or an assumable IAM role for AWS-backed stages
- NGINX/systemd only when using the corresponding local providers

Install dependencies:

```bash
pnpm install
```

Run the web control plane:

```bash
pnpm dev
```

Quality gates:

```bash
pnpm check
pnpm test
pnpm build
```

## Linux host setup

Local NGINX/systemd providers use narrowly scoped root helpers while the GateHouse application itself continues running as a non-root user.

Install host helpers with:

```bash
pnpm setup:linux
```

or directly:

```bash
sudo bash install/linux/install.sh
```

The installer:

- determines the non-root GateHouse user
- verifies required host commands
- installs GateHouse NGINX/service helper executables
- writes a constrained sudoers entry
- validates the sudoers file
- validates NGINX configuration

## Safety principles

GateHouse prefers refusal over ambiguous infrastructure mutation.

In particular:

- discovery does not imply ownership
- externally managed stack children cannot be adopted piecemeal
- dry-run/health comparison precedes ownership transfer
- failed first reconciliation rolls ownership back
- dependency checks precede destructive lifecycle operations
- data-bearing providers may intentionally omit destroy support
- restore is transactional and runs under maintenance mode
- unsupported AWS topology remains inventory-only

## Tests and CI

`GateHouse Check` runs on the active development branch and pull requests.

The release gate includes:

1. dependency installation
2. TypeScript/Svelte checks
3. safety tests
4. build

Safety tests currently cover dependency planning, cycle/missing-dependency failures, ownership classification, and CloudFormation retention transformation/refusal rules.

## Release direction

Before a public 1.0 release GateHouse should be dogfooded against a real existing AWS estate and exercise:

- discovery accuracy
- observed/external ownership classification
- individual adoption
- CloudFormation retention/detach flows
- reconciliation recovery
- backup/restore
- destructive lifecycle confirmations

The goal is not to support every possible AWS topology immediately. The goal is to make every supported topology explicit, inspectable, and safe.
