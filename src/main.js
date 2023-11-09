// @ts-check

const core = require("@actions/core");

async function main() {
  try {
    const image = core.getInput("test-runner-image");
    console.log(`Using image: ${image}`);
  } catch (err) {
    core.setFailed(err);
  }
}

module.exports = {
  main,
};
