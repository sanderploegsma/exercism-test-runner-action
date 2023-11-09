import * as core from "@actions/core";
import { exec } from "@actions/exec";
import { cp } from "@actions/io";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import chalk from "chalk";

/**
 * Run the test runner on the given exercise.
 * @param {string} slug Slug for the exercise
 * @param {string} exercisePath Path to the exercise
 * @param {string} image Docker image for the test runner
 * @returns {Promise<object>} The test results provided by the test runner
 */
async function runTestRunner(slug, exercisePath, image) {
  core.debug(`Running ${image} on ${slug} at ${exercisePath}`);
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

  const results = await fs.readFile(
    path.join(exercisePath, "results.json"),
    "utf8",
  );
  return JSON.parse(results);
}

function printResults(slug, results) {
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
        break;
      case "error":
        core.info(`[${chalk.red(test.status.toUpperCase())}] ${test.name}`);
        break;
    }
  }

  for (const test of results.tests.filter((t) => t.status !== "pass")) {
    core.warning(test.message, {
      title: `[${slug}] Test failed: ${test.name}`,
    });
  }
}

/**
 *
 * @param {string} slug Slug for the exercise
 * @param {string} exercisePath Path to the exercise
 * @param {string} implementationKey
 * @param {string} image
 */
async function testExercise(slug, exercisePath, implementationKey, image) {
  core.info(`Testing exercise: ${slug}`);
  const config = JSON.parse(
    await fs.readFile(path.join(exercisePath, ".meta/config.json"), "utf8"),
  );

  core.debug("Backing up solution files");
  await Promise.all(
    config.files.solution.map((/** @type {String} */ relativePath) => {
      const filePath = path.join(exercisePath, relativePath);
      const targetFilePath = `${filePath}.bak`;
      return cp(filePath, targetFilePath);
    }),
  );

  core.debug("Copying implementation files");
  const targetDir = path.join(
    exercisePath,
    path.dirname(config.files.solution[0]),
  );
  await Promise.all(
    config.files[implementationKey].map(
      (/** @type {String} */ relativePath) => {
        const filePath = path.join(exercisePath, relativePath);
        const targetFilePath = path.join(targetDir, path.basename(filePath));
        return cp(filePath, targetFilePath);
      },
    ),
  );

  const results = await runTestRunner(slug, exercisePath, image);
  printResults(slug, results);
}

export async function main() {
  try {
    const image = core.getInput("test-runner-image", { required: true });
    core.info(`Pulling Docker image ${image}`);
    await exec("docker", ["pull", image]);

    const conceptExercises = await fs.readdir("exercises/concept");
    core.debug(`Found concept exercises: ${conceptExercises}`);
    for (const slug of conceptExercises) {
      await testExercise(
        slug,
        path.resolve("exercises/concept", slug),
        "exemplar",
        image,
      );
    }

    const practiceExercises = await fs.readdir("exercises/practice");
    core.debug(`Found practice exercises: ${practiceExercises}`);
    for (const slug of practiceExercises) {
      await testExercise(
        slug,
        path.resolve("exercises/practice", slug),
        "example",
        image,
      );
    }
  } catch (err) {
    core.setFailed(err);
  }
}
