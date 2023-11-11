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
      core.setFailed("One or more tests resulted in an error");
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

function createTableFromSummaries(summaries: TestSummary[]): SummaryTableRow[] {
  return [
    [
      { data: "Exercise", header: true },
      { data: "Status", header: true },
      { data: "Duration", header: true },
    ],
    ...summaries.map((s) => [
      s.name,
      s.status,
      s.duration ? formatDuration(s.duration) : "",
    ]),
  ];
}

export async function main(options: Options) {
  try {
    await prepareTestRunner(options.image);
    const config = await readTrackConfig(process.cwd());

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
