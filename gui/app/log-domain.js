const signature = ({ jobsDir, job, file }) => `${jobsDir}\u0000${job}\u0000${file}`;

// A tail response is valid only for the exact directory/job/file selection that launched it.
// Generation also rejects an older request when the user returns to the same selection later.
export function createLogReadGuard() {
  let generation = 0;
  let selected = "";
  return {
    select(context) { selected = signature(context); generation += 1; },
    snapshot(context, offset) { return Object.freeze({ generation, selected: signature(context), offset }); },
    isCurrent(request, context) { return request.generation === generation && request.selected === selected && request.selected === signature(context); },
  };
}
