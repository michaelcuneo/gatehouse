import type {
  AuditLog as GateHouseAuditLog,
  AWSProvider as GateHouseAWSProvider,
  BaseResource as GateHouseBaseResource,
  CertificateProvider as GateHouseCertificateProvider,
  CertificateResource as GateHouseCertificateResource,
  CertificateSpec as GateHouseCertificateSpec,
  DNSRecordResource as GateHouseDNSRecordResource,
  DNSRecordSpec as GateHouseDNSRecordSpec,
  DNSRecordType as GateHouseDNSRecordType,
  EndpointMode as GateHouseEndpointMode,
  EndpointResource as GateHouseEndpointResource,
  EndpointSpec as GateHouseEndpointSpec,
  GeneratedNginxConfig as GateHouseGeneratedNginxConfig,
  LocalProvider as GateHouseLocalProvider,
  LocalStorageSpec as GateHouseLocalStorageSpec,
  MachineState as GateHouseMachineState,
  ReconciliationContext as GateHouseReconciliationContext,
  ReconciliationResult as GateHouseReconciliationResult,
  Resource as GateHouseResource,
  ResourceDependencyGraph as GateHouseResourceDependencyGraph,
  ResourceId as GateHouseResourceId,
  ResourceKind as GateHouseResourceKind,
  ResourceProvider as GateHouseResourceProvider,
  ResourceProviderHandler as GateHouseResourceProviderHandler,
  ResourceReference as GateHouseResourceReference,
  ResourceStatus as GateHouseResourceStatus,
  ReverseProxyEndpointSpec as GateHouseReverseProxyEndpointSpec,
  S3StorageSpec as GateHouseS3StorageSpec,
  ServicePort as GateHouseServicePort,
  ServiceResource as GateHouseServiceResource,
  ServiceRuntime as GateHouseServiceRuntime,
  ServiceSpec as GateHouseServiceSpec,
  StaticEndpointSpec as GateHouseStaticEndpointSpec,
  StaticSiteResource as GateHouseStaticSiteResource,
  StaticSiteSpec as GateHouseStaticSiteSpec,
  StorageBucketResource as GateHouseStorageBucketResource,
  StorageBucketSpec as GateHouseStorageBucketSpec,
  StorageProvider as GateHouseStorageProvider,
  Timestamp as GateHouseTimestamp,
} from "@gatehouse/types";

declare global {
  type ResourceId = GateHouseResourceId;
  type Timestamp = GateHouseTimestamp;

  type LocalProvider = GateHouseLocalProvider;
  type AWSProvider = GateHouseAWSProvider;
  type ResourceProvider = GateHouseResourceProvider;

  type ResourceKind = GateHouseResourceKind;
  type ResourceStatus = GateHouseResourceStatus;

  type BaseResource<
    TKind extends ResourceKind,
    TSpec,
  > = GateHouseBaseResource<TKind, TSpec>;

  type EndpointMode = GateHouseEndpointMode;
  type ReverseProxyEndpointSpec = GateHouseReverseProxyEndpointSpec;
  type StaticEndpointSpec = GateHouseStaticEndpointSpec;
  type EndpointSpec = GateHouseEndpointSpec;
  type EndpointResource = GateHouseEndpointResource;

  type ServiceRuntime = GateHouseServiceRuntime;
  type ServicePort = GateHouseServicePort;
  type ServiceSpec = GateHouseServiceSpec;
  type ServiceResource = GateHouseServiceResource;

  type CertificateProvider = GateHouseCertificateProvider;
  type CertificateSpec = GateHouseCertificateSpec;
  type CertificateResource = GateHouseCertificateResource;

  type DNSRecordType = GateHouseDNSRecordType;
  type DNSRecordSpec = GateHouseDNSRecordSpec;
  type DNSRecordResource = GateHouseDNSRecordResource;

  type StorageProvider = GateHouseStorageProvider;
  type LocalStorageSpec = GateHouseLocalStorageSpec;
  type S3StorageSpec = GateHouseS3StorageSpec;
  type StorageBucketSpec = GateHouseStorageBucketSpec;
  type StorageBucketResource = GateHouseStorageBucketResource;

  type StaticSiteSpec = GateHouseStaticSiteSpec;
  type StaticSiteResource = GateHouseStaticSiteResource;

  type Resource = GateHouseResource;

  type ReconciliationResult = GateHouseReconciliationResult;
  type ReconciliationContext = GateHouseReconciliationContext;
  type ResourceProviderHandler<
    T extends Resource = Resource,
  > = GateHouseResourceProviderHandler<T>;

  type GeneratedNginxConfig = GateHouseGeneratedNginxConfig;
  type ResourceReference = GateHouseResourceReference;
  type ResourceDependencyGraph = GateHouseResourceDependencyGraph;
  type MachineState = GateHouseMachineState;
  type AuditLog = GateHouseAuditLog;
}

export {};
