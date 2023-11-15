import * as core from "@actions/core";
import { exec } from "@actions/exec";
import { join } from "node:path";
import { hrtime } from "node:process";

import { readJsonFile } from "./json";

/**
 * A single test passed.
 *
 * @see {@link https://exercism.org/docs/building/tooling/test-runners/interface#h-per-test Test Runner interface}
 */
interface TestPassed {
  name: string;
  status: "pass";
}

/**
 * A single test failed or errored.
 *
 * @see {@link https://exercism.org/docs/building/tooling/test-runners/interface#h-per-test Test Runner interface}
 */
interface TestFailed {
  name: string;
  status: "fail" | "error";
  message: string;
}

/**
 * All tests passed.
 *
 * @see {@link https://exercism.org/docs/building/tooling/test-runners/interface Test Runner interface}
 */
interface AllTestsPassed {
  status: "pass";
  tests: Array<TestPassed>;
}

/**
 * One or more tests didn't pass.
 *
 * @see {@link https://exercism.org/docs/building/tooling/test-runners/interface Test Runner interface}
 */
interface OneOrMoreTestsFailed {
  status: "fail";
  tests: Array<TestPassed | TestFailed>;
}

/**
 * An error occurred when running the tests.
 *
 * @see {@link https://exercism.org/docs/building/tooling/test-runners/interface Test Runner interface}
 */
interface ErrorRunningTests {
  status: "error";
  message: string;
}

/**
 * Results from running the tests.
 *
 * @see {@link https://exercism.org/docs/building/tooling/test-runners/interface Test Runner interface}
 */
type TestRunnerOutput =
  | AllTestsPassed
  | OneOrMoreTestsFailed
  | ErrorRunningTests;

export type TestResults = TestRunnerOutput & {
  /**
   * Duration of the test run in milliseconds.
   */
  duration: number;
};

export interface TestRunnerOptions {
  image: string;
}

export async function prepareTestRunner({ image }: TestRunnerOptions) {
  return exec("docker", ["pull", image]);
}

export async function runTestRunner(
  slug: string,
  workdir: string,
  { image }: TestRunnerOptions,
): Promise<TestResults> {
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
    "/tmp:exec",
    image,
    slug,
    "/solution",
    "/output",
  ]);

  const end = hrtime.bigint();
  core.debug("Test runner finished");

  const results = await readJsonFile<TestRunnerOutput>(
    join(workdir, "results.json"),
  );
  return {
    ...results,
    duration: Number(end - start) / 1.0e6,
  };
}
