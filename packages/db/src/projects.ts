import type {
  ManagedProject,
  ManagedStage,
  ProjectAccess,
  ProjectCapabilities,
  ProjectManifestLocation,
  AwsResourceSelector,
  ProjectStageContext,
} from "@gatehouse/core";

import { getDatabase } from "./client";

type ProjectRow = {
  id: string;
  slug: string;
  name: string;
  provider: "aws";
  diagnostics_profile: string | null;
  created_at: string;
  updated_at: string;
};

type StageRow = {
  id: string;
  project_id: string;
  name: string;
  account_id: string;
  primary_region: string;
  additional_regions: string | null;
  access: string;
  capabilities: string;
  selectors: string | null;
  manifest: string | null;
  enabled: number;
};

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function stageFromRow(row: StageRow): ManagedStage {
  return {
    id: row.id,
    name: row.name,
    accountId: row.account_id,
    primaryRegion: row.primary_region,
    additionalRegions: parseJson<string[]>(row.additional_regions, []),
    access: parseJson<ProjectAccess>(row.access, { mode: "default" }),
    capabilities: parseJson<ProjectCapabilities>(row.capabilities, {
      logs: false,
      errors: false,
      requests: false,
      functions: false,
      services: false,
      databases: false,
      queues: false,
      metrics: false,
      costs: false,
      deployments: false,
      traces: false,
      aiUsage: false,
      auth: false,
      diagnostics: false,
    }),
    selectors: parseJson<AwsResourceSelector[]>(row.selectors, []),
    manifest: row.manifest
      ? parseJson<ProjectManifestLocation | undefined>(row.manifest, undefined)
      : undefined,
    enabled: row.enabled === 1,
  };
}

function hydrateProject(row: ProjectRow, stages: StageRow[]): ManagedProject {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    provider: row.provider,
    diagnosticsProfile: row.diagnostics_profile ?? undefined,
    stages: stages.map(stageFromRow),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listManagedProjects(): ManagedProject[] {
  const db = getDatabase();

  const projects = db
    .prepare("SELECT * FROM managed_projects ORDER BY name ASC")
    .all() as ProjectRow[];

  const stages = db
    .prepare(
      "SELECT * FROM managed_project_stages ORDER BY project_id ASC, name ASC",
    )
    .all() as StageRow[];

  const stagesByProject = new Map<string, StageRow[]>();

  for (const stage of stages) {
    const rows = stagesByProject.get(stage.project_id) ?? [];
    rows.push(stage);
    stagesByProject.set(stage.project_id, rows);
  }

  return projects.map((project) =>
    hydrateProject(project, stagesByProject.get(project.id) ?? []),
  );
}

export function getManagedProject(idOrSlug: string): ManagedProject | null {
  const db = getDatabase();

  const project = db
    .prepare(
      "SELECT * FROM managed_projects WHERE id = ? OR slug = ? LIMIT 1",
    )
    .get(idOrSlug, idOrSlug) as ProjectRow | undefined;

  if (!project) return null;

  const stages = db
    .prepare(
      "SELECT * FROM managed_project_stages WHERE project_id = ? ORDER BY name ASC",
    )
    .all(project.id) as StageRow[];

  return hydrateProject(project, stages);
}

export function saveManagedProject(project: ManagedProject): ManagedProject {
  const db = getDatabase();

  const save = db.transaction(() => {
    db.prepare(
      `
        INSERT INTO managed_projects (
          id,
          slug,
          name,
          provider,
          diagnostics_profile,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          slug = excluded.slug,
          name = excluded.name,
          provider = excluded.provider,
          diagnostics_profile = excluded.diagnostics_profile,
          updated_at = excluded.updated_at
      `,
    ).run(
      project.id,
      project.slug,
      project.name,
      project.provider,
      project.diagnosticsProfile ?? null,
      project.createdAt,
      project.updatedAt,
    );

    const stageIds = project.stages.map((stage) => stage.id);

    if (stageIds.length > 0) {
      const placeholders = stageIds.map(() => "?").join(", ");

      db.prepare(
        `
          DELETE FROM managed_project_stages
          WHERE project_id = ?
          AND id NOT IN (${placeholders})
        `,
      ).run(project.id, ...stageIds);
    } else {
      db.prepare(
        "DELETE FROM managed_project_stages WHERE project_id = ?",
      ).run(project.id);
    }

    const statement = db.prepare(
      `
        INSERT INTO managed_project_stages (
          id,
          project_id,
          name,
          account_id,
          primary_region,
          additional_regions,
          access,
          capabilities,
          selectors,
          manifest,
          enabled
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          project_id = excluded.project_id,
          name = excluded.name,
          account_id = excluded.account_id,
          primary_region = excluded.primary_region,
          additional_regions = excluded.additional_regions,
          access = excluded.access,
          capabilities = excluded.capabilities,
          selectors = excluded.selectors,
          manifest = excluded.manifest,
          enabled = excluded.enabled
      `,
    );

    for (const stage of project.stages) {
      statement.run(
        stage.id,
        project.id,
        stage.name,
        stage.accountId,
        stage.primaryRegion,
        JSON.stringify(stage.additionalRegions ?? []),
        JSON.stringify(stage.access),
        JSON.stringify(stage.capabilities),
        JSON.stringify(stage.selectors ?? []),
        stage.manifest ? JSON.stringify(stage.manifest) : null,
        stage.enabled ? 1 : 0,
      );
    }
  });

  save();

  return getManagedProject(project.id) ?? project;
}

export function deleteManagedProject(idOrSlug: string): boolean {
  const project = getManagedProject(idOrSlug);
  if (!project) return false;

  const db = getDatabase();
  const remove = db.transaction(() => {
    db.prepare(
      "DELETE FROM managed_project_stages WHERE project_id = ?",
    ).run(project.id);

    db.prepare("DELETE FROM managed_projects WHERE id = ?").run(project.id);
  });

  remove();
  return true;
}

export function getManagedStage(
  projectIdOrSlug: string,
  stageNameOrId: string,
): { project: ManagedProject; stage: ManagedStage } | null {
  const project = getManagedProject(projectIdOrSlug);
  if (!project) return null;

  const stage = project.stages.find(
    (candidate) =>
      candidate.id === stageNameOrId || candidate.name === stageNameOrId,
  );

  return stage ? { project, stage } : null;
}


export function getManagedStageById(
  stageId: string,
): ProjectStageContext | null {
  for (const project of listManagedProjects()) {
    const stage = project.stages.find((candidate) => candidate.id === stageId);

    if (stage) {
      return { project, stage };
    }
  }

  return null;
}
