import * as core from "@actions/core";
import { exec } from "@actions/exec";
import { cp } from "@actions/io";
import { readFile } from "node:fs/promises";
import * as pathLib from "node:path";
import { hrtime } from "node:process";
import chalk from "chalk";

import {
  TrackConfig,
  ExerciseConfig,
  ConceptExerciseMetadata,
  PracticeExerciseMetadata,
  TestRunnerResult,
} from "./types";

export interface Options {
  image: string;
  concept: boolean;
  practice: boolean;
  includeWip: boolean;
  includeDeprecated: boolean;
}

type ConceptExercise = ExerciseConfig & {
  type: "concept";
  path: string;
  metadata: ConceptExerciseMetadata;
};

type PracticeExercise = ExerciseConfig & {
  type: "practice";
  path: string;
  metadata: PracticeExerciseMetadata;
};

type Exercise = ConceptExercise | PracticeExercise;

type TestResult = TestRunnerResult & {
  /**
   * Duration of the test run in milliseconds.
   */
  duration: number;
};

async function readJsonFile<T>(path: string): Promise<T> {
  core.debug(`Reading JSON file ${path}`);
  const data = await readFile(path, "utf8");
  return JSON.parse(data);
}

async function runTestRunner(
  { slug, path }: Exercise,
  { image }: Options,
): Promise<TestResult> {
  core.debug("Starting test runner");
  const start = hrtime.bigint();
  await exec("docker", [
    "run",
    "--rm",
    "--network",
    "none",
    "--mount",
    `type=bind,src=${path},dst=/solution`,
    "--mount",
    `type=bind,src=${path},dst=/output`,
    "--tmpfs",
    "/tmp:rw",
    image,
    slug,
    "/solution",
    "/output",
  ]);

  const end = hrtime.bigint();
  core.debug("Test runner finished");

  const results = await readJsonFile<TestRunnerResult>(
    pathLib.join(path, "results.json"),
  );
  return {
    ...results,
    duration: Number(end - start) / 1.0e6,
  };
}

function printResult({ name }: Exercise, result: TestResult) {
  if (result.status === "error") {
    core.error(result.message, {
      title: `[${name}] Error while running tests`,
    });
    return;
  }

  for (const test of result.tests) {
    switch (test.status) {
      case "pass":
        core.info(`[${chalk.green(test.status.toUpperCase())}] ${test.name}`);
        break;
      case "fail":
        core.info(`[${chalk.yellow(test.status.toUpperCase())}] ${test.name}`);
        core.warning(test.message, {
          title: `[${name}] Test failed: ${test.name}`,
        });
        break;
      case "error":
        core.info(`[${chalk.red(test.status.toUpperCase())}] ${test.name}`);
        core.warning(test.message, {
          title: `[${name}] Test errored: ${test.name}`,
        });
        break;
    }
  }
  core.info(`Duration: ${result.duration.toPrecision(3)} ms`);
}

async function copyImplementationFiles(exercise: Exercise) {
  const targetDir = pathLib.join(
    exercise.path,
    pathLib.dirname(exercise.metadata.files.solution[0]),
  );

  core.debug("Backing up solution files");
  await Promise.all(
    exercise.metadata.files.solution.map((relativePath) => {
      const filePath = pathLib.join(exercise.path, relativePath);
      const targetFilePath = `${filePath}.bak`;
      return cp(filePath, targetFilePath);
    }),
  );

  core.debug("Copying implementation files");
  let files = [];
  switch (exercise.type) {
    case "concept":
      files = exercise.metadata.files.exemplar;
      break;
    case "practice":
      files = exercise.metadata.files.example;
      break;
  }
  await Promise.all(
    files.map((relativePath) => {
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
  if (exercise.type === "concept" && !options.concept) {
    core.info(`Skipping concept exercise: ${exercise.name}`);
    return;
  }

  if (exercise.type === "practice" && !options.practice) {
    core.info(`Skipping practice exercise: ${exercise.name}`);
    return;
  }

  if (exercise.status === "wip" && !options.includeWip) {
    core.info(`Skipping work-in-progress exercise: ${exercise.name}`);
    return;
  }

  if (exercise.status === "deprecated" && !options.includeDeprecated) {
    core.info(`Skipping deprecated exercise: ${exercise.name}`);
    return;
  }

  core.info(`Testing exercise: ${exercise.name}`);
  await copyImplementationFiles(exercise);
  const result = await runTestRunner(exercise, options);
  printResult(exercise, result);
}

async function prepare({ image }: Options) {
  await exec("docker", ["pull", image]);
}

async function getPracticeExercises(
  config: TrackConfig,
): Promise<PracticeExercise[]> {
  const directory = "exercises/practice";

  return Promise.all(
    config.exercises.practice.map(async (exercise) => {
      const path = pathLib.resolve(directory, exercise.slug);
      const metadata = await readJsonFile<PracticeExerciseMetadata>(
        pathLib.join(path, ".meta/config.json"),
      );
      return {
        type: "practice",
        path,
        metadata,
        ...exercise,
      };
    }),
  );
}

async function getConceptExercises(
  config: TrackConfig,
): Promise<ConceptExercise[]> {
  const directory = "exercises/concept";

  return Promise.all(
    config.exercises.concept.map(async (exercise) => {
      const path = pathLib.resolve(directory, exercise.slug);
      const metadata = await readJsonFile<ConceptExerciseMetadata>(
        pathLib.join(path, ".meta/config.json"),
      );
      return {
        type: "concept",
        path,
        metadata,
        ...exercise,
      };
    }),
  );
}

async function getExercises(): Promise<Exercise[]> {
  const config = await readJsonFile<TrackConfig>("config.json");
  const concept = await getConceptExercises(config);
  const practice = await getPracticeExercises(config);
  return [
    ...concept.sort((a, b) => a.name.localeCompare(b.name)),
    ...practice.sort((a, b) => a.name.localeCompare(b.name)),
  ];
}

export async function main(options: Options) {
  try {
    await prepare(options);
    const exercises = await getExercises();
    for (const exercise of exercises) {
      await testExercise(exercise, options);
    }
  } catch (err) {
    if (err instanceof Error) {
      core.setFailed(err);
    } else {
      core.setFailed(`An error occurred: ${err}`);
    }
  }
}
