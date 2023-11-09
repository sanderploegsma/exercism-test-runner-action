# Exercism Test Runner action

This action tests an Exercism track repository using that track's test runner.

## Inputs

### `test-runner-image`

**Required** The Docker image of the test runner.

### `test-concept-exercises`

**Required** Whether to test concept exercises. Defaults to `true`.

### `test-practice-exercises`

**Required** Whether to test practice exercises. Defaults to `true`.

### `include-wip-exercises`

**Required** Whether to test exercises marked as work-in-progress. Defaults to `false`.

### `include-deprecated-exercises`

**Required** Whether to test exercises marked as deprecated. Defaults to `false`.

## Outputs

None.

## Example usage

```yaml
uses: sanderploegsma/exercism-test-runner-action@main
with:
  test-runner-image: exercism/java-test-runner
```
