// @ts-check

const core = require("@actions/core");
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");

/**
 * Run the test runner on the given exercise.
 * @param {string} slug Slug for the exercise
 * @param {string} exercisePath Path to the exercise
 * @param {string} image Docker image for the test runner
 * @returns {Promise<object>} The test results provided by the test runner
 */
async function runTestRunner(slug, exercisePath, image) {
  core.debug(`Running ${image} on ${slug} at ${exercisePath}`);
  await new Promise((resolve, reject) => {
    const proc = spawn("docker", [
      "run",
      "--rm",
      "--network none",
      `--mount type=bind,src=${exercisePath},dst=/solution`,
      `--mount type=bind,src=${exercisePath},dst=/output`,
      "--tmpfs /tmp:rw",
      image,
      slug,
      "/solution",
      "/output",
    ]);

    proc.on("exit", (code) =>
      code && code > 0
        ? reject(`Process exited with code ${code}`)
        : resolve(null),
    );
  });

  const results = await fs.readFile(
    path.join(exercisePath, "results.json"),
    "utf8",
  );
  return JSON.parse(results);
}

/**
 *
 * @param {string} slug Slug for the exercise
 * @param {string} exercisePath Path to the exercise
 * @param {string} implementationKey
 * @param {string} image
 */
async function testExercise(slug, exercisePath, implementationKey, image) {
  const config = JSON.parse(
    await fs.readFile(path.join(exercisePath, ".meta/config.json"), "utf8"),
  );
  core.debug("Backing up solution files");
  await Promise.all(
    config.solution.map((/** @type {String} */ relativePath) => {
      const filePath = path.join(exercisePath, relativePath);
      const targetFilePath = `${filePath}.bak`;
      core.debug(`Copying ${filePath} to ${targetFilePath}`);
      return fs.copyFile(filePath, targetFilePath);
    }),
  );

  core.debug("Copying implementation files");
  const targetDir = path.join(exercisePath, path.dirname(config.solution[0]));
  await Promise.all(
    config[implementationKey].map((/** @type {String} */ relativePath) => {
      const filePath = path.join(exercisePath, relativePath);
      const targetFilePath = path.join(targetDir, path.basename(filePath));
      core.debug(`Copying ${filePath} to ${targetFilePath}`);
      return fs.copyFile(filePath, targetFilePath);
    }),
  );

  const results = await runTestRunner(slug, exercisePath, image);

  if (results.status !== "pass") {
    core.warning(`Tests failed for exercise ${slug}`);
    core.setFailed("One or more exercises didn't pass the tests");
  }
}

async function main() {
  try {
    const image = core.getInput("test-runner-image", { required: true });

    core.info("Testing concept exercises");
    const conceptExercises = await fs.readdir("exercises/concept");
    core.debug(`Found concept exercises: ${conceptExercises}`);
    for (const slug in conceptExercises) {
      core.info(`Testing concept exercise ${slug}`);
      await testExercise(
        slug,
        path.join("exercises/concept", slug),
        "exemplar",
        image,
      );
    }

    core.info("Testing practice exercises");
    const practiceExercises = await fs.readdir("exercises/practice");
    core.debug(`Found practice exercises: ${practiceExercises}`);
    for (const slug in practiceExercises) {
      core.info(`Testing practice exercise ${slug}`);
      await testExercise(
        slug,
        path.join("exercises/practice", slug),
        "example",
        image,
      );
    }
  } catch (err) {
    core.setFailed(err);
  }
}

module.exports = {
  main,
};
