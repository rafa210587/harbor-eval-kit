export async function runDeleteAction(action, { setLocked, setError }) {
  setError("");
  setLocked(true);
  try {
    await action();
    return true;
  } catch (error) {
    setError(`Não foi possível remover: ${error?.message || String(error)}`);
    return false;
  } finally {
    setLocked(false);
  }
}

export function initializationFailureMessage(results) {
  const failures = results
    .filter(({ result }) => result.status === "rejected")
    .map(({ label, result }) => `${label}: ${result.reason?.message || String(result.reason)}`);
  return failures.length
    ? `A interface carregou parcialmente. ${failures.join(" · ")}. Recarregue a página depois de corrigir o problema.`
    : "";
}
