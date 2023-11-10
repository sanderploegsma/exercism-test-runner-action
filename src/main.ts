import * as core from "@actions/core";
import { SummaryTableRow } from "@actions/core/lib/summary";
import { exec } from "@actions/exec";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { hrtime } from "node:process";
import { Chalk } from "chalk";

const chalk = new Chalk({ level: 3 });

import {
  TrackConfig,
  Exercise,
  ExerciseMetadata,
  TestRunnerResult,
  ExerciseConfig,
} from "./types";
import { prepareWorkingDirectory } from "./workdir";

export interface Options {
  image: string;
  concept: boolean;
  practice: boolean;
  includeWip: boolean;
  includeDeprecated: boolean;
}

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
  slug: string,
  workdir: string,
  image: string,
): Promise<TestResult> {
  core.debug("Starting test runner");
  const start = hrtime.bigint();
  await exec("docker", [
    "run",
    "--rm",
    "--network",
    "none",
    "--mount",
    `type=bind,src=${workdir},dst=/solution`,
    "--mount",
    `type=bind,src=${workdir},dst=/output`,
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
    join(workdir, "results.json"),
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
  core.info(`Duration: ${result.duration.toFixed(3)} ms`);
}

interface TestSummary {
  name: string;
  duration?: number;
  status: string;
}

async function testExercise(
  exercise: Exercise,
  options: Options,
): Promise<TestSummary> {
  if (exercise.status === "wip" && !options.includeWip) {
    core.info(`Skipping work-in-progress exercise: ${exercise.name}`);
    return { ...exercise, status: "Skipped: work-in-progress" };
  }

  if (exercise.status === "deprecated" && !options.includeDeprecated) {
    core.info(`Skipping deprecated exercise: ${exercise.name}`);
    return { ...exercise, status: "Skipped: deprecated" };
  }

  core.info(`Testing exercise: ${exercise.name}`);
  const workdir = await prepareWorkingDirectory(exercise);
  const result = await runTestRunner(exercise.slug, workdir, options.image);
  printResult(exercise, result);

  switch (result.status) {
    case "pass":
    case "fail":
      const passed = result.tests.filter((t) => t.status === "pass").length;
      const total = result.tests.length;
      const icon = passed == total ? "✅" : "⚠️";
      return {
        ...exercise,
        duration: result.duration,
        status: `${icon} ${passed}/${total}`,
      };
    case "error":
      return { ...exercise, duration: result.duration, status: "❌ Error" };
  }
}

async function testExercises(
  exercises: Exercise[],
  options: Options,
): Promise<TestSummary[]> {
  let summaries: TestSummary[] = [];
  for (const exercise of exercises.sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const summary = await testExercise(exercise, options);
    summaries = [...summaries, summary];
  }
  return summaries;
}

async function prepare({ image }: Options) {
  await exec("docker", ["pull", image]);
}

async function getExercises(
  exercises: ExerciseConfig[],
  directory: string,
): Promise<Exercise[]> {
  return Promise.all(
    exercises.map(async (exercise) => {
      const path = resolve(directory, exercise.slug);
      const metadata = await readJsonFile<ExerciseMetadata>(
        join(path, ".meta/config.json"),
      );
      return {
        path,
        metadata,
        ...exercise,
      };
    }),
  );
}

function createTableFromSummaries(summaries: TestSummary[]): SummaryTableRow[] {
  return [
    [
      { data: "Exercise", header: true },
      { data: "Status", header: true },
      { data: "Duration (ms)", header: true },
    ],
    ...summaries.map((s) => [s.name, s.status, s.duration?.toFixed(3) ?? ""]),
  ];
}

export async function main(options: Options) {
  try {
    await prepare(options);
    const config = await readJsonFile<TrackConfig>("config.json");

    if (options.concept) {
      const exercises = await getExercises(
        config.exercises.concept,
        "exercises/concept",
      );
      const summaries = await testExercises(exercises, options);
      core.summary
        .addHeading("Concept exercise test results", 2)
        .addTable(createTableFromSummaries(summaries));
    }

    if (options.practice) {
      const exercises = await getExercises(
        config.exercises.practice,
        "exercises/practice",
      );
      const summaries = await testExercises(exercises, options);
      core.summary
        .addHeading("Practice exercise test results", 2)
        .addTable(createTableFromSummaries(summaries));
    }

    core.summary.write();
  } catch (err) {
    if (err instanceof Error) {
      core.setFailed(err);
    } else {
      core.setFailed(`An error occurred: ${err}`);
    }
  }
}
