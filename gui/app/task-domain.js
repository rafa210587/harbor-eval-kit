export function taskFilesForSave(values, solveHadContent) {
  const files = {
    instruction: values.instruction,
    dockerfile: values.dockerfile,
    testSh: values.testSh,
  };
  // The current API represents both a missing solve.sh and an empty solve.sh as "". Omitting
  // an untouched empty value preserves either state; include it when the user typed a solution,
  // or when clearing a solution that previously had content.
  if (solveHadContent || values.solveSh !== "") files.solveSh = values.solveSh;
  return files;
}
