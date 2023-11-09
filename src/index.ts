/**
 * The entrypoint for the action.
 */
import { getInput, getBooleanInput } from "@actions/core";
import { main } from "./main";

main({
  image: getInput("test-runner-image", { required: true }),
  concept: getBooleanInput("test-concept-exercises", { required: true }),
  practice: getBooleanInput("test-practice-exercises", { required: true }),
  includeWip: getBooleanInput("include-wip-exercises", { required: true }),
  includeDeprecated: getBooleanInput("include-deprecated-exercises", {
    required: true,
  }),
});
