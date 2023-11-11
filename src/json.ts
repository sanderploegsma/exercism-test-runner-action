import * as core from "@actions/core";
import { readFile } from "node:fs/promises";

export async function readJsonFile<T>(file: string): Promise<T> {
  core.debug(`Reading JSON file ${file}`);
  const data = await readFile(file, "utf8");
  return JSON.parse(data);
}
