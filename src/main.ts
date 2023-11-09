import * as core from "@actions/core";
import { exec } from "@actions/exec";
import { cp } from "@actions/io";
import { readdir, readFile } from "node:fs/promises";
import * as pathLib from "node:path";
import chalk from "chalk";

import {
  TrackConfiguration,
  ConceptExerciseMetadata,
  PracticeExerciseMetadata,
  TestExecutionResult,
} from "./types";

export interface Options {
  image: string;
}

interface ExerciseFiles {
  stubs: string[];
  implementation: string[];
}

interface Exercise {
  slug: string;
  path: string;
  files: ExerciseFiles;
}

async function readJsonFile<T>(path: string): Promise<T> {
  const data = await readFile(path, "utf8");
  return JSON.parse(data);
}

async function runTestRunner(
  slug: string,
  exercisePath: string,
  image: string,
) {
  await exec("docker", [
    "run",
    "--rm",
    "--network",
    "none",
    "--mount",
    `type=bind,src=${exercisePath},dst=/solution`,
    "--mount",
    `type=bind,src=${exercisePath},dst=/output`,
    "--tmpfs",
    "/tmp:rw",
    image,
    slug,
    "/solution",
    "/output",
  ]);
}

function printResults({ slug }: Exercise, results: TestExecutionResult) {
  if (results.status === "error") {
    core.error(results.message, {
      title: `[${slug}] Error while running tests`,
    });
    return;
  }

  for (const test of results.tests) {
    switch (test.status) {
      case "pass":
        core.info(`[${chalk.green(test.status.toUpperCase())}] ${test.name}`);
        break;
      case "fail":
        core.info(`[${chalk.yellow(test.status.toUpperCase())}] ${test.name}`);
        core.warning(test.message, {
          title: `[${slug}] Test failed: ${test.name}`,
        });
        break;
      case "error":
        core.info(`[${chalk.red(test.status.toUpperCase())}] ${test.name}`);
        core.warning(test.message, {
          title: `[${slug}] Test errored: ${test.name}`,
        });
        break;
    }
  }
}

async function copyImplementationFiles(exercise: Exercise) {
  const targetDir = pathLib.join(
    exercise.path,
    pathLib.dirname(exercise.files.stubs[0]),
  );

  core.debug("Backing up stub files");
  await Promise.all(
    exercise.files.stubs.map((relativePath) => {
      const filePath = pathLib.join(exercise.path, relativePath);
      const targetFilePath = `${filePath}.bak`;
      return cp(filePath, targetFilePath);
    }),
  );

  core.debug("Copying implementation files");
  await Promise.all(
    exercise.files.implementation.map((relativePath) => {
      const filePath = pathLib.join(exercise.path, relativePath);
      const targetFilePath = pathLib.join(
        targetDir,
        pathLib.basename(filePath),
      );
      return cp(filePath, targetFilePath);
    }),
  );
}

async function testExercise(exercise: Exercise, options: Options) {
  core.info(`Testing exercise: ${exercise.slug}`);
  await copyImplementationFiles(exercise);
  await runTestRunner(exercise.slug, exercise.path, options.image);

  const results = await readJsonFile<TestExecutionResult>(
    pathLib.join(exercise.path, "results.json"),
  );
  printResults(exercise, results);
}

async function prepare({ image }: Options) {
  await exec("docker", ["pull", image]);
}

async function testConceptExercises(options: Options) {
  const directory = "exercises/concept";
  const exercises = await readdir(directory);
  core.debug(`Found concept exercises: ${exercises}`);

  for (const slug of exercises) {
    const path = pathLib.resolve(directory, slug);
    const metadata = await readJsonFile<ConceptExerciseMetadata>(
      pathLib.join(path, ".meta/config.json"),
    );
    await testExercise(
      {
        slug,
        path,
        files: {
          stubs: metadata.files.solution,
          implementation: metadata.files.exemplar,
        },
      },
      options,
    );
  }
}

async function testPracticeExercises(options: Options) {
  const directory = "exercises/practice";
  const exercises = await readdir(directory);
  core.debug(`Found practice exercises: ${exercises}`);

  for (const slug of exercises) {
    const path = pathLib.resolve(directory, slug);
    const metadata = await readJsonFile<PracticeExerciseMetadata>(
      pathLib.join(path, ".meta/config.json"),
    );
    await testExercise(
      {
        slug,
        path,
        files: {
          stubs: metadata.files.solution,
          implementation: metadata.files.example,
        },
      },
      options,
    );
  }
}

export async function main(options: Options) {
  try {
    await prepare(options);
    await testConceptExercises(options);
    await testPracticeExercises(options);
  } catch (err) {
    if (err instanceof Error) {
      core.setFailed(err);
    } else {
      core.setFailed(`An error occurred: ${err}`);
    }
  }
}
