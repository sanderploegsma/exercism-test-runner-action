// @ts-check

const core = require("@actions/core");
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const chalk = require("chalk");

const color = new chalk.Instance({ level: 3 });

/**
 * Pull the given Docker image.
 * @param {string} image Docker image to pull
 * @returns {Promise<void>}
 */
async function pullImage(image) {
  return new Promise((resolve, reject) => {
    const proc = spawn("docker", ["pull", image]);

    proc.stdout.on("data", (data) => core.debug(`stdout: ${data}`));
    proc.stderr.on("data", (data) => core.debug(`stderr: ${data}`));

    proc.on("exit", (code) =>
      code && code > 0 ? reject(`Process exited with code ${code}`) : resolve(),
    );
  });
}

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

    proc.stdout.on("data", (data) => core.debug(`stdout: ${data}`));
    proc.stderr.on("data", (data) => core.debug(`stderr: ${data}`));

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

function printResults(slug, results) {
  if (results.status === "error") {
    core.error(results.message, {
      title: `Failed to run tests for exercise ${slug}`,
    });
    return;
  }

  let passed = 0;
  let total = 0;
  for (const test of results.tests) {
    total++;
    if (test.status === "pass") {
      passed++;
      core.info(color.green(`- ${test.name}`));
    } else {
      core.info(color.red(`- ${test.name}`));
      core.info(test.message);
    }
  }

  if (passed < total) {
    core.warning(`${passed}/${total} of tests passed`, {
      title: `Test results for exercise ${slug}`,
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
  const config = JSON.parse(
    await fs.readFile(path.join(exercisePath, ".meta/config.json"), "utf8"),
  );

  core.debug("Backing up solution files");
  await Promise.all(
    config.files.solution.map((/** @type {String} */ relativePath) => {
      const filePath = path.join(exercisePath, relativePath);
      const targetFilePath = `${filePath}.bak`;
      core.debug(`Copying ${filePath} to ${targetFilePath}`);
      return fs.copyFile(filePath, targetFilePath);
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
        core.debug(`Copying ${filePath} to ${targetFilePath}`);
        return fs.copyFile(filePath, targetFilePath);
      },
    ),
  );

  const results = await runTestRunner(slug, exercisePath, image);
  printResults(slug, results);
}

async function main() {
  try {
    const image = core.getInput("test-runner-image", { required: true });
    await core.group(`Pulling Docker image ${image}`, () => pullImage(image));

    const conceptExercises = await fs.readdir("exercises/concept");
    core.debug(`Found concept exercises: ${conceptExercises}`);
    for (const slug of conceptExercises) {
      await core.group(`Testing concept exercise: ${slug}`, () =>
        testExercise(
          slug,
          path.resolve("exercises/concept", slug),
          "exemplar",
          image,
        ),
      );
    }

    const practiceExercises = await fs.readdir("exercises/practice");
    core.debug(`Found practice exercises: ${practiceExercises}`);
    for (const slug of practiceExercises) {
      await core.group(`Testing practice exercise: ${slug}`, () =>
        testExercise(
          slug,
          path.resolve("exercises/practice", slug),
          "example",
          image,
        ),
      );
    }
  } catch (err) {
    core.setFailed(err);
  }
}

module.exports = {
  main,
};
