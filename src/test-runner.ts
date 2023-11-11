import * as core from "@actions/core";
import { exec } from "@actions/exec";
import { join } from "node:path";
import { hrtime } from "node:process";

import { readJsonFile } from "./json";

interface TestPassed {
  name: string;
  status: "pass";
}

interface TestFailed {
  name: string;
  status: "fail" | "error";
  message: string;
}

interface TestRunnerPassedOrFailedResult {
  status: "pass" | "fail";
  tests: Array<TestPassed | TestFailed>;
}

interface TestRunnerErrorResult {
  status: "error";
  message: string;
}

type TestRunnerResult = TestRunnerPassedOrFailedResult | TestRunnerErrorResult;

export type TestResult = TestRunnerResult & {
  /**
   * Duration of the test run in milliseconds.
   */
  duration: number;
};

export async function prepareTestRunner(image: string) {
  return exec("docker", ["pull", image]);
}

export async function runTestRunner(
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
    "--mount",
    "type=tmpfs,dst=/tmp",
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
