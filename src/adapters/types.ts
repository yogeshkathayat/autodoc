export interface AIAdapter {
  readonly name: string;
  preflight(): Promise<{ ok: boolean; message?: string; installUrl?: string }>;
  runUpdate(input: UpdateInput): Promise<UpdateResult>;
  runBootstrap(input: BootstrapInput): Promise<BootstrapResult>;
}

export interface UpdateInput {
  repoRoot: string;
  changedFiles: string[];
  affectedDocs: AffectedDoc[];
  manifestPath: string;
}

export interface AffectedDoc {
  id: string;
  docPath: string;
  watches: string[];
  purpose: string;
  strategy: 'surgical' | 'rewrite';
  triggeringFiles: string[];
}

export interface UpdateResult {
  updatedDocs: string[];
  skippedDocs: { path: string; reason: string }[];
  reviewSuggested: string[];
  summary: string;
}

export interface BootstrapInput {
  repoRoot: string;
  manifestPath: string;
  mappings: ManifestMapping[];
}

export interface ManifestMapping {
  id: string;
  doc: string;
  watches: string[];
  purpose: string;
  strategy: 'surgical' | 'rewrite';
}

export interface BootstrapResult {
  createdDocs: string[];
  skippedMappings: { id: string; reason: string }[];
  summary: string;
}
