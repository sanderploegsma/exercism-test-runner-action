import * as core from "@actions/core";
import { SummaryTableRow } from "@actions/core/lib/summary";
import { resolve } from "node:path";
import { Chalk } from "chalk";
import * as duration from "humanize-duration";

import { prepareTestRunner, runTestRunner, TestResult } from "./test-runner";
import {
  readTrackConfig,
  readExerciseMetadata,
  Exercise,
  ExerciseConfig,
} from "./config";
import { prepareWorkingDirectory } from "./workdir";

const chalk = new Chalk({ level: 3 });

export interface Options {
  image: string;
  concept: boolean;
  practice: boolean;
  includeWip: boolean;
  includeDeprecated: boolean;
}

function formatDuration(ms: number): string {
  return duration(ms, { units: ["m", "s", "ms"], round: true });
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
  core.info(`Duration: ${formatDuration(result.duration)}`);
}

interface ExerciseTestSkipped {
  status: "skipped";
  skipReason: string;
  exercise: Exercise;
}

type ExerciseTestResult =
  | ExerciseTestSkipped
  | (TestResult & {
      exercise: Exercise;
    });

async function testExercise(
  exercise: Exercise,
  options: Options,
): Promise<ExerciseTestResult> {
  if (exercise.status === "wip" && !options.includeWip) {
    core.info(`Skipping work-in-progress exercise: ${exercise.name}`);
    return { status: "skipped", skipReason: "work-in-progress", exercise };
  }

  if (exercise.status === "deprecated" && !options.includeDeprecated) {
    core.info(`Skipping deprecated exercise: ${exercise.name}`);
    return { status: "skipped", skipReason: "deprecated", exercise };
  }

  core.info(`Testing exercise: ${exercise.name}`);
  const workdir = await prepareWorkingDirectory(exercise);
  const result = await runTestRunner(exercise.slug, workdir, options.image);
  printResult(exercise, result);

  return { ...result, exercise };
}

async function testExercises(
  exercises: Exercise[],
  options: Options,
): Promise<ExerciseTestResult[]> {
  let results: ExerciseTestResult[] = [];
  for (const exercise of exercises.sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const result = await testExercise(exercise, options);
    results = [...results, result];
  }
  return results;
}

async function getExercises(
  exercises: ExerciseConfig[],
  directory: string,
): Promise<Exercise[]> {
  return Promise.all(
    exercises.map(async (exercise) => {
      const path = resolve(directory, exercise.slug);
      const metadata = await readExerciseMetadata(path);
      return {
        path,
        metadata,
        ...exercise,
      };
    }),
  );
}

function createSummaryTable(results: ExerciseTestResult[]): SummaryTableRow[] {
  const getStatus = (result: ExerciseTestResult): string => {
    switch (result.status) {
      case "pass":
      case "fail":
        const passed = result.tests.filter((t) => t.status === "pass").length;
        const total = result.tests.length;
        const icon = passed == total ? "✅" : "⚠️";
        return `${icon} ${passed}/${total}`;
      case "error":
        return "❌ Error";
      case "skipped":
        return `Skipped: ${result.skipReason}`;
    }
  };

  const getDuration = (result: ExerciseTestResult): string => {
    switch (result.status) {
      case "skipped":
        return "";
      case "pass":
      case "fail":
      case "error":
        return formatDuration(result.duration);
    }
  };

  return [
    [
      { data: "Exercise", header: true },
      { data: "Status", header: true },
      { data: "Duration", header: true },
    ],
    ...results.map((result) => [
      result.exercise.name,
      getStatus(result),
      getDuration(result),
    ]),
  ];
}

export async function main(options: Options) {
  try {
    await prepareTestRunner(options.image);
    const config = await readTrackConfig(process.cwd());

    const conceptExercises = await getExercises(
      config.exercises.concept,
      "exercises/concept",
    );

    if (options.concept && conceptExercises.length > 0) {
      const results = await testExercises(conceptExercises, options);
      core.summary
        .addHeading("Concept exercise test results", 2)
        .addTable(createSummaryTable(results));

      const errored = results
        .filter((r) => r.status === "error")
        .map((r) => r.exercise.name);
      if (errored.length > 0) {
        core.setFailed(`Concept exercises errored: ${errored.join(", ")}`);
      }
    }

    const practiceExercises = await getExercises(
      config.exercises.practice,
      "exercises/practice",
    );

    if (options.practice && practiceExercises.length > 0) {
      const results = await testExercises(practiceExercises, options);
      core.summary
        .addHeading("Practice exercise test results", 2)
        .addTable(createSummaryTable(results));

      const errored = results
        .filter((r) => r.status === "error")
        .map((r) => r.exercise.name);
      if (errored.length > 0) {
        core.setFailed(`Practice exercises errored: ${errored.join(", ")}`);
      }
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
