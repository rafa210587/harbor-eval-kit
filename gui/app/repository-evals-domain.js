export function parseArgv(value) {
  let parsed;
  try { parsed = JSON.parse(String(value || "")); }
  catch { throw new Error('Comando deve ser um array JSON, por exemplo ["pytest","-q"].'); }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((part) => typeof part !== "string" || !part.trim())) throw new Error("Comando exige um array JSON não vazio, somente com strings.");
  return parsed;
}

export function parseExitCodes(value) {
  const codes = String(value ?? "0").split(",").map((part) => Number(part.trim()));
  if (!codes.length || codes.some((code) => !Number.isInteger(code))) throw new Error("Códigos de saída devem ser inteiros separados por vírgula.");
  return [...new Set(codes)];
}

export function sourceFromDraft(kind, location, ref) {
  const source = { kind, location: String(location || "").trim() };
  if (!source.location) throw new Error("Informe o caminho ou URL da fonte.");
  if (!["local", "git"].includes(kind)) throw new Error("Origem deve ser local ou Git.");
  if (String(ref || "").trim()) source.ref = String(ref).trim();
  return source;
}

export function checkFromDraft(draft) {
  const timeoutSec = Number(draft.timeoutSec), weight = Number(draft.weight);
  if (!String(draft.id || "").trim()) throw new Error("Cada check precisa de um identificador.");
  if (!Number.isInteger(timeoutSec) || timeoutSec < 1) throw new Error("Timeout do check deve ser um inteiro positivo.");
  if (!Number.isFinite(weight) || weight <= 0) throw new Error("Peso do check deve ser positivo.");
  return { id: String(draft.id).trim(), argv: parseArgv(draft.argv), cwd: String(draft.cwd || ".").trim() || ".", timeoutSec, acceptedExitCodes: parseExitCodes(draft.acceptedExitCodes), weight, required: draft.required === true };
}

export function recipeProblems(recipe, step = 4) {
  const errors = [];
  if (step >= 0 && !String(recipe.label || "").trim()) errors.push("Dê um nome à receita.");
  if (step >= 0 && !recipe.codeSource?.location) errors.push("Informe a fonte do código.");
  if (step >= 1 && !recipe.specPaths?.length) errors.push("Selecione ao menos um documento de spec.");
  if (step >= 2 && !/^[-\w.]+\/[-\w.]+$/.test(recipe.reference?.repository || "")) errors.push("Repositório de referência deve usar owner/repo.");
  if (step >= 2 && (!Number.isInteger(recipe.reference?.prNumber) || recipe.reference.prNumber < 1)) errors.push("Informe um número de PR positivo.");
  if (step >= 3 && recipe.threshold !== undefined && (!Number.isFinite(recipe.threshold) || recipe.threshold < 0 || recipe.threshold > 1)) errors.push("Limiar deve estar entre 0 e 1.");
  if (step >= 3 && !recipe.checks?.length) errors.push("Cadastre ao menos um check determinístico.");
  if (step >= 3 && recipe.checks && !recipe.checks.some((item) => item.required)) errors.push("Marque ao menos um check como obrigatório.");
  if (step >= 3 && recipe.allowPassingBase === true && !String(recipe.passingBaseReason || "").trim()) errors.push("Justifique por que o código inicial pode passar os checks.");
  if (step >= 4 && recipe.agentTimeoutSec !== undefined && (!Number.isSafeInteger(recipe.agentTimeoutSec) || recipe.agentTimeoutSec <= 0)) errors.push("Prazo do agente deve resultar em segundos inteiros positivos dentro da precisão segura.");
  if (step >= 4 && recipe.trusted !== true) errors.push("Confirme que a fonte é confiável antes de preparar.");
  return errors;
}

export function importedRecipe(payload) {
  const recipe = payload?.recipe || payload;
  if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) throw new Error("Arquivo não contém uma receita.");
  return recipe;
}
