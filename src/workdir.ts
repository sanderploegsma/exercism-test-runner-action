import * as core from "@actions/core";
import { cp, mkdirP } from "@actions/io";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { Exercise } from "./types";

async function copy(fromPath: string, toPath: string) {
  core.debug(`Copying ${fromPath} to ${toPath}`);
  await mkdirP(dirname(toPath));
  return cp(fromPath, toPath);
}

async function copyMetadata(exercise: Exercise, workdir: string) {
  core.debug(`Copying metadata files`);
  return copy(
    join(exercise.path, ".meta/config.json"),
    join(workdir, ".meta/config.json"),
  );
}

async function copyTestFiles(exercise: Exercise, workdir: string) {
  core.debug(`Copying test files`);
  await Promise.all(
    exercise.metadata.files.test.map((file) =>
      copy(join(exercise.path, file), join(workdir, file)),
    ),
  );
}

async function copyEditorFiles(exercise: Exercise, workdir: string) {
  if (!exercise.metadata.files.editor) {
    return;
  }

  core.debug(`Copying helper files`);
  await Promise.all(
    exercise.metadata.files.editor.map((file) =>
      copy(join(exercise.path, file), join(workdir, file)),
    ),
  );
}

async function copyImplementationFiles(exercise: Exercise, workdir: string) {
  let solutionFiles = exercise.metadata.files.solution;
  // Some tracks like Java have solution files in a nested structure,
  // which we have to respect.
  // For example, solution files are located in src/main/java,
  // while example files are located in .meta/src/reference/java.
  let relativeSolutionDir = dirname(solutionFiles[0]);

  let exampleFiles: string[] = [];
  switch (exercise.type) {
    case "concept":
      exampleFiles = [...exampleFiles, ...exercise.metadata.files.exemplar];
      break;
    case "practice":
      exampleFiles = [...exampleFiles, ...exercise.metadata.files.example];
      break;
  }

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

  await Promise.all([
    copyMetadata(exercise, workdir),
    copyTestFiles(exercise, workdir),
    copyEditorFiles(exercise, workdir),
    copyImplementationFiles(exercise, workdir),
  ]);

  return workdir;
}
