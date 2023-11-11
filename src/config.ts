import { join } from "node:path";

import { readJsonFile } from "./json";

export interface ExerciseConfig {
  uuid: string;
  slug: string;
  name: string;
  status?: "wip" | "beta" | "active" | "deprecated";
}

export interface TrackConfig {
  exercises: {
    concept: ExerciseConfig[];
    practice: ExerciseConfig[];
  };
}

export interface ExerciseMetadata {
  authors: string[];
  contributors?: string[];
  files: {
    solution: string[];
    test: string[];
    editor?: string[];
    invalidator?: string[];
    exemplar?: string[];
    example?: string[];
  };
  blurb: string;
  source?: string;
  source_url?: string;
}

export type Exercise = ExerciseConfig & {
  path: string;
  metadata: ExerciseMetadata;
};

export async function readTrackConfig(path: string): Promise<TrackConfig> {
  return readJsonFile<TrackConfig>(join(path, "config.json"));
}

export async function readExerciseMetadata(
  path: string,
): Promise<ExerciseMetadata> {
  return readJsonFile<ExerciseMetadata>(join(path, ".meta/config.json"));
}
