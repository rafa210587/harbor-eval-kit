"""Manifest transactions and conservative build policy. No Harbor dependency."""
import json
import os
import re
import time
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

PREFIX = "harbor-eval-kit-"
LABEL = "io.harbor-eval-kit.managed"
KINDS = ("containers", "images", "networks", "volumes")


def read_manifest(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if data.get("schema_version") != 1 or not isinstance(data.get("preexisting"), dict):
        raise ValueError("Manifest de instalação ausente ou inválido; execute snapshot primeiro")
    for kind in KINDS:
        if not isinstance(data.get("managed_resources", {}).get(kind), list):
            raise ValueError(f"Manifest inválido: {kind}")
    return data


@contextmanager
def transaction(path):
    """Serialize trial writers; a crash leaves a visible lock rather than a lost manifest."""
    path = Path(path)
    lock = Path(str(path) + ".runtime-lock")
    deadline = time.monotonic() + 30
    while True:
        try:
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.close(fd)
            break
        except FileExistsError:
            if time.monotonic() >= deadline:
                raise RuntimeError("Manifest em uso; confira o processo antes de remover um lock abandonado")
            time.sleep(0.05)
    temporary = Path(str(path) + f".{uuid4().hex}.tmp")
    try:
        data = read_manifest(path)
        yield data
        with temporary.open("x", encoding="utf-8") as stream:
            json.dump(data, stream, indent=2)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
        lock.unlink()


def reserve(path, names, job_path):
    if any(kind not in KINDS or not name.startswith(PREFIX) for kind, name in names.items()):
        raise ValueError("Recurso fora do namespace gerenciado")
    with transaction(path) as data:
        for kind, name in names.items():
            if any((entry if isinstance(entry, str) else entry.get("name")) == name
                   for entry in data["managed_resources"][kind]):
                raise ValueError("Identidade de recurso já reservada")
            data["managed_resources"][kind].append({"name": name, "jobPath": str(job_path)})


def remember(path, kind, name, identity):
    with transaction(path) as data:
        for entry in data["managed_resources"][kind]:
            if isinstance(entry, dict) and entry.get("name") == name:
                if entry.get("id") not in (None, identity):
                    raise ValueError("Identidade do recurso mudou; recurso preservado")
                entry["id"] = identity
                return
        raise ValueError("Recurso sem reserva no manifest")


def prove(path, kind, name, item):
    labels = item.get("Config", {}).get("Labels") or item.get("Labels") or item.get("labels") or {}
    identity = item.get("Id") or item.get("ID") or item.get("id") or item.get("Name")
    names = item.get("RepoTags", []) if kind == "images" else [item.get("Name", item.get("name", ""))]
    normalized = [n.removeprefix("/").removeprefix("localhost/").removesuffix(":latest") for n in names]
    if labels.get(LABEL) != "true" or not normalized or any(n != name for n in normalized):
        raise ValueError("Propriedade ambígua; recurso preservado")
    entries = read_manifest(path)["managed_resources"][kind]
    if not any(isinstance(e, dict) and e.get("name") == name and e.get("id") == identity for e in entries):
        raise ValueError("Identidade não conciliada no manifest; recurso preservado")
    return identity


def reconcile_reserved(path, kind, name, item):
    """Attach an observed ID only when reservation, exact name and label all agree."""
    labels = item.get("Config", {}).get("Labels") or item.get("Labels") or item.get("labels") or {}
    identity = item.get("Id") or item.get("ID") or item.get("id") or item.get("Name")
    names = item.get("RepoTags", []) if kind == "images" else [item.get("Name", item.get("name", ""))]
    normalized = [n.removeprefix("/").removeprefix("localhost/").removesuffix(":latest") for n in names]
    if not identity or labels.get(LABEL) != "true" or not normalized or any(n != name for n in normalized):
        raise ValueError("Propriedade ambígua; recurso preservado")
    with transaction(path) as data:
        entries = data["managed_resources"][kind]
        matches = [entry for entry in entries if isinstance(entry, dict) and entry.get("name") == name]
        if len(matches) != 1 or matches[0].get("id") not in (None, identity):
            raise ValueError("Reserva não conciliável; recurso preservado")
        matches[0]["id"] = identity
    return identity


def base_images(dockerfile):
    """No implicit pulls or external COPY images. Ambiguous dynamic builds are refused."""
    stages, images = set(), []
    text = re.sub(r"\\\r?\n", " ", dockerfile)
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if re.match(r"VOLUME\s", line, re.I):
            raise ValueError("VOLUME criaria recurso anônimo fora do manifest; use mounts gerenciados")
        if re.match(r"(?:ADD)\s", line, re.I) and re.search(r"https?://|git@", line):
            raise ValueError("ADD remoto não suportado; forneça o contexto exportado")
        if re.match(r"(?:COPY|RUN)\s", line, re.I):
            for source in re.findall(r"(?:--from=|from=)([^,\s]+)", line):
                if source.lower() not in stages and not source.isdigit():
                    raise ValueError("Build com imagem externa adicional não suportado")
        if not re.match(r"FROM\s", line, re.I):
            continue
        parts = line.split()
        if len(parts) < 2 or parts[1].startswith("--") or "$" in parts[1]:
            raise ValueError("FROM dinâmico/plataforma explícita requer suporte verificado")
        source = parts[1]
        if source.lower() not in stages and source.lower() != "scratch":
            images.append(source)
        if len(parts) >= 4 and parts[2].lower() == "as":
            stages.add(parts[3].lower())
    if not re.search(r"^\s*FROM\s", text, re.I | re.M):
        raise ValueError("Dockerfile sem FROM")
    return list(dict.fromkeys(images))
