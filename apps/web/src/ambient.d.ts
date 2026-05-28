// ============================================
// CORE RESOURCE SYSTEM
// ============================================

type ResourceId = string;
type Timestamp = string;

type LocalProvider = 'nginx' | 'filesystem' | 'systemd';

type AWSProvider = 'route53' | 's3' | 'acm';

type ResourceProvider = LocalProvider | AWSProvider;

type ResourceKind =
	| 'endpoint'
	| 'service'
	| 'certificate'
	| 'dns_record'
	| 'storage_bucket'
	| 'static_site';

type ResourceStatus = 'pending' | 'reconciling' | 'ready' | 'error' | 'disabled';

interface BaseResource<TKind extends ResourceKind, TSpec> {
	id: ResourceId;

	kind: TKind;

	name: string;

	provider: ResourceProvider;

	version: number;

	enabled: boolean;

	status: ResourceStatus;

	createdAt: Timestamp;
	updatedAt: Timestamp;

	metadata?: {
		description?: string;

		tags?: string[];

		managed?: boolean;
	};

	runtime?: {
		lastReconciledAt?: Timestamp;

		lastError?: string;

		lastStatusMessage?: string;

		healthy?: boolean;
	};

	spec: TSpec;
}

// ============================================
// ENDPOINTS
// ============================================

type EndpointMode = 'reverse_proxy' | 'static';

interface ReverseProxyEndpointSpec {
	mode: 'reverse_proxy';

	host: string;

	upstream: {
		host: string;
		port: number;
	};

	websocket?: boolean;

	ssl?: boolean;

	redirectToHttps?: boolean;
}

interface StaticEndpointSpec {
	mode: 'static';

	host: string;

	root: string;

	spaFallback?: boolean;

	ssl?: boolean;

	redirectToHttps?: boolean;
}

type EndpointSpec = ReverseProxyEndpointSpec | StaticEndpointSpec;

type EndpointResource = BaseResource<'endpoint', EndpointSpec>;

// ============================================
// SERVICES
// ============================================

type ServiceRuntime = 'node' | 'bun' | 'docker' | 'python' | 'binary';

interface ServicePort {
	name: string;
	port: number;
	protocol: 'http' | 'https' | 'tcp';
}

interface ServiceSpec {
	runtime: ServiceRuntime;

	workingDirectory: string;

	startCommand: string;

	envFile?: string;

	ports: ServicePort[];

	autoStart?: boolean;

	healthcheck?: {
		path: string;
		intervalSeconds: number;
	};
}

type ServiceResource = BaseResource<'service', ServiceSpec>;

// ============================================
// CERTIFICATES
// ============================================

type CertificateProvider = 'acme' | 'aws_acm';

interface CertificateSpec {
	domains: string[];

	wildcard?: boolean;

	provider: CertificateProvider;

	email: string;

	autoRenew?: boolean;
}

type CertificateResource = BaseResource<'certificate', CertificateSpec>;

// ============================================
// DNS
// ============================================

type DNSRecordType = 'A' | 'AAAA' | 'CNAME' | 'TXT';

interface DNSRecordSpec {
	zone: string;

	name: string;

	type: DNSRecordType;

	value: string;

	ttl?: number;
}

type DNSRecordResource = BaseResource<'dns_record', DNSRecordSpec>;

// ============================================
// STORAGE
// ============================================

type StorageProvider = 'local' | 's3';

interface LocalStorageSpec {
	provider: 'local';

	path: string;
}

interface S3StorageSpec {
	provider: 's3';

	bucket: string;

	region: string;

	public?: boolean;
}

type StorageBucketSpec = LocalStorageSpec | S3StorageSpec;

type StorageBucketResource = BaseResource<'storage_bucket', StorageBucketSpec>;

// ============================================
// STATIC SITES
// ============================================

interface StaticSiteSpec {
	buildDirectory: string;

	outputDirectory: string;

	endpointId?: ResourceId;

	storageId?: ResourceId;

	deployOnChange?: boolean;
}

type StaticSiteResource = BaseResource<'static_site', StaticSiteSpec>;

// ============================================
// RESOURCE REGISTRY
// ============================================

type Resource =
	| EndpointResource
	| ServiceResource
	| CertificateResource
	| DNSRecordResource
	| StorageBucketResource
	| StaticSiteResource;

// ============================================
// RECONCILIATION
// ============================================

interface ReconciliationResult {
	success: boolean;

	changed: boolean;

	message?: string;

	warnings?: string[];

	errors?: string[];
}

interface ReconciliationContext {
	dryRun?: boolean;

	force?: boolean;

	triggeredBy?: string;
}

interface ResourceProviderHandler<T extends Resource = Resource> {
	validate(resource: T): Promise<void>;

	reconcile(resource: T, context: ReconciliationContext): Promise<ReconciliationResult>;

	destroy?(resource: T): Promise<ReconciliationResult>;
}

// ============================================
// GENERATED NGINX MODEL
// ============================================

interface GeneratedNginxConfig {
	filename: string;

	serverName: string;

	config: string;
}

// ============================================
// DEPENDENCY SYSTEM
// ============================================

interface ResourceReference {
	kind: ResourceKind;

	id: ResourceId;
}

interface ResourceDependencyGraph {
	resourceId: ResourceId;

	dependsOn: ResourceReference[];
}

// ============================================
// LOCAL MACHINE STATE
// ============================================

interface MachineState {
	nginxInstalled: boolean;

	nginxRunning: boolean;

	acmeInstalled: boolean;

	dockerInstalled: boolean;

	publicIp?: string;
}

// ============================================
// AUDIT LOGS
// ============================================

interface AuditLog {
	id: string;

	resourceId: ResourceId;

	action: 'create' | 'update' | 'delete' | 'reconcile';

	timestamp: Timestamp;

	success: boolean;

	message?: string;
}
