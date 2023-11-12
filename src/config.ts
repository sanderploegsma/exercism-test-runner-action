import { join } from "node:path";

import { readJsonFile } from "./json";

/**
 * Configuration for a single exercise.
 *
 * @see {@link https://exercism.org/docs/building/tracks/config-json#h-exercises config.json}
 */
export interface ExerciseConfig {
  uuid: string;
  slug: string;
  name: string;
  status?: "wip" | "beta" | "active" | "deprecated";
}

/**
 * Configuration for the Exercism track.
 *
 * @see {@link https://exercism.org/docs/building/tracks/config-json config.json}
 */
export interface TrackConfig {
  exercises: {
    concept: ExerciseConfig[];
    practice: ExerciseConfig[];
  };
}

/**
 * Metadata for a single exercise.
 *
 * @see {@link https://exercism.org/docs/building/tracks/concept-exercises#h-file-meta-config-json Concept exercise config.json}
 * @see {@link https://exercism.org/docs/building/tracks/practice-exercises#h-file-meta-config-json Practice exercise config.json}
 */
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
