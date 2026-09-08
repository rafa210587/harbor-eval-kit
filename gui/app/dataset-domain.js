/** Match the actual output folder, not a registry namespace or platform separator. */
export function downloadedTasks(tasks, outputDir) {
  const normalize = (value) => String(value).replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
  const root = normalize(outputDir || "datasets");
  return tasks.filter(task => task.source === "datasets" && normalize(task.path).startsWith(root + "/"));
}
