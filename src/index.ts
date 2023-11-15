/**
 * The entrypoint for the action.
 */
import { getInput, getBooleanInput } from "@actions/core";
import { main } from "./main";

main({
  concept: getBooleanInput("test-concept-exercises", { required: true }),
  practice: getBooleanInput("test-practice-exercises", { required: true }),
  includeWip: getBooleanInput("include-wip-exercises", { required: true }),
  includeDeprecated: getBooleanInput("include-deprecated-exercises", {
    required: true,
  }),
  testRunnerOptions: {
    image: getInput("test-runner-image", { required: true }),
  },
  workDirOptions: {
    renameExampleFiles: getBooleanInput("rename-example-files", {
      required: true,
    }),
  },
});
