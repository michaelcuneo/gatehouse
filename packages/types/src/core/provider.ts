export type LocalProvider = "nginx" | "filesystem" | "systemd";

export type AWSProvider = "route53" | "s3" | "acm" | "dynamodb";

export type ResourceProvider = LocalProvider | AWSProvider;
