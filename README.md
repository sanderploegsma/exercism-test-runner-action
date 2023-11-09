# Exercism Test Runner action

This action tests an Exercism track repository using that track's test runner.

## Inputs

### `test-runner-image`

**Required** The Docker image of the test runner.

## Outputs

None.

## Example usage

```yaml
uses: sanderploegsma/exercism-test-runner-action@main
with:
  test-runner-image: exercism/java-test-runner
```
