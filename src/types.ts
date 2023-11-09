interface ExerciseConfig {
  uuid: string;
  slug: string;
  name: string;
  status?: "wip" | "beta" | "active" | "deprecated";
}

export interface TrackConfiguration {
  exercises: {
    concept: ExerciseConfig[];
    practice: ExerciseConfig[];
  };
}

interface ExerciseMetadata {
  authors: string[];
  contributors?: string[];
  files: {
    solution: string[];
    test: string[];
    editor?: string[];
    invalidator?: string[];
  };
  blurb: string;
  source?: string;
  source_url?: string;
}

export type ConceptExerciseMetadata = ExerciseMetadata & {
  files: {
    exemplar: string[];
  };
};

export type PracticeExerciseMetadata = ExerciseMetadata & {
  files: {
    example: string[];
  };
};

interface TestResult {
  name: string;
}

interface FailedTestResult {
  status: "fail" | "error";
  message: string;
}

interface PassedTestResult {
  status: "pass";
}

interface TestExecutionResultPassedOrFailed {
  status: "pass" | "fail";
  tests: Array<TestResult & (FailedTestResult | PassedTestResult)>;
}

interface TestExecutionError {
  status: "error";
  message: string;
}

export type TestExecutionResult =
  | TestExecutionResultPassedOrFailed
  | TestExecutionError;
