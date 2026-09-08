export function defaultCriterionSetIds(judges, judgeId) {
  const judge = judges.find((item) => item.id === judgeId);
  return [...(judge?.defaultRubricIds || [])];
}

export function effectiveStandaloneCriterionSetIds(checkedIds) {
  const selected = [...new Set(checkedIds || [])];
  return selected.length ? selected : ["__default__"];
}
