import type { BaseResource } from "../core/resource";

export type LambdaArchitecture = "x86_64" | "arm64";

export interface LambdaFunctionSpec {
  provider: "lambda";
  functionName: string;
  region: string;
  codeMode: "external";
  runtime?: string;
  handler?: string;
  memorySize: number;
  timeout: number;
  architecture: LambdaArchitecture;
  roleArn?: string;
}

export type FunctionResource = BaseResource<
  "function",
  LambdaFunctionSpec
>;
