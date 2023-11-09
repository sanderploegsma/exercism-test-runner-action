/**
 * The entrypoint for the action.
 */
import { getInput } from "@actions/core";
import { main } from "./main";

const image = getInput("test-runner-image", { required: true });

main({ image });
