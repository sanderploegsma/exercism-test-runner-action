import * as core from "@actions/core";
import { mkdirP } from "@actions/io";
import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, basename, relative } from "node:path";
import { Exercise } from "./config";

async function copy(fromPath: string, toPath: string) {
  core.debug(`Copying ${fromPath} to ${toPath}`);
  await mkdirP(dirname(toPath));
  return cp(fromPath, toPath);
}

async function copyImplementationFiles(exercise: Exercise, workdir: string) {
  let solutionFiles = exercise.metadata.files.solution;
  // Some tracks like Java have solution files in a nested structure,
  // which we have to respect.
  // For example, solution files are located in src/main/java,
  // while example files are located in .meta/src/reference/java.
  let relativeSolutionDir = dirname(solutionFiles[0]);

  let exampleFiles: string[] = [
    ...(exercise.metadata.files.example ?? []),
    ...(exercise.metadata.files.exemplar ?? []),
  ];

  while (solutionFiles.length > 0 && exampleFiles.length > 0) {
    const exampleFile = exampleFiles.shift();
    const solutionFile = solutionFiles.shift();

    if (exampleFile && solutionFile) {
      await copy(join(exercise.path, exampleFile), join(workdir, solutionFile));
      continue;
    }

    if (exampleFile) {
      await copy(
        join(exercise.path, exampleFile),
        join(workdir, relativeSolutionDir, basename(exampleFile)),
      );
      continue;
    }

    if (solutionFile) {
      await copy(
        join(exercise.path, solutionFile),
        join(workdir, solutionFile),
      );
      continue;
    }
  }
}

export async function prepareWorkingDirectory(
  exercise: Exercise,
): Promise<string> {
  core.debug("Creating temporary working directory");
  const workdir = await mkdtemp(join(tmpdir(), exercise.slug));
  core.debug(`Created temporary working directory: ${workdir}`);

  core.debug("Cloning exercise directory");
  await cp(exercise.path, workdir, {
    recursive: true,
    filter(source, destination): boolean {
      const relativeSource = relative(exercise.path, source);
      if (exercise.metadata.files.solution.some((f) => f === relativeSource)) {
        core.debug(`Skipping solution file ${source}`);
        return false;
      }

      if (exercise.metadata.files.example?.some((f) => f === relativeSource)) {
        core.debug(`Skipping example file ${source}`);
        return false;
      }

      if (exercise.metadata.files.exemplar?.some((f) => f === relativeSource)) {
        core.debug(`Skipping exemplar file ${source}`);
        return false;
      }

      return true;
    },
  });

  core.debug("Copying implementation files");
  await copyImplementationFiles(exercise, workdir);

  return workdir;
}
