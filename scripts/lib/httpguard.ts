// Browser-origin guard for the local API.
//
// WHY THIS EXISTS: binding to 127.0.0.1 keeps the network out, but it does NOT keep the
// user's own browser out. Any page the user has open can POST to http://127.0.0.1:4173 --
// with `Content-Type: text/plain` that is a CORS "simple request", so there is no preflight
// to refuse and the request is delivered even though the attacker cannot read the reply.
// Confirmed against this server before the guard existed: a POST carrying
// `Origin: https://evil.example.com` created a registry entry and it persisted to disk.
// Side effects alone are enough to matter here -- this API can spend real API-key money
// (/api/compare), silently repoint a Judge's model (corrupting an evaluation), delete every
// registry, or import a whole config bundle.
//
// Two independent checks, because they stop two different attacks:
//
// - **Origin** stops a plain cross-site request: browsers always attach Origin to a
//   cross-origin POST, including simple ones. A missing Origin is allowed on purpose --
//   curl, the kit's own scripts and every non-browser client omit it, and none of them are
//   the threat being modelled here.
// - **Host** stops DNS rebinding, where the page IS same-origin by the time it fires (so
//   Origin looks fine) because attacker.com was re-resolved to 127.0.0.1. The Host header
//   still carries the attacker's name, which is the only thing that gives it away.

/** Hostnames that mean "this machine's loopback", i.e. the only ones this server answers to. */
const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "[::1]"];

export interface OriginGuardResult {
  allowed: boolean;
  /** Human-readable reason, surfaced to the caller as the 403 body. Null when allowed. */
  reason: string | null;
}

function hostnameOf(hostHeader: string): string {
  // "127.0.0.1:4173" -> "127.0.0.1"; "[::1]:4173" -> "[::1]"; bare "localhost" -> "localhost".
  const trimmed = hostHeader.trim();
  if (trimmed.startsWith("[")) {
    const close = trimmed.indexOf("]");
    return close === -1 ? trimmed : trimmed.slice(0, close + 1);
  }
  const colon = trimmed.lastIndexOf(":");
  return colon === -1 ? trimmed : trimmed.slice(0, colon);
}

/**
 * Decides whether a request may touch the API at all.
 *
 * `port` is the port this server is actually listening on: a Host header naming the right
 * hostname but the wrong port is still rejected, since it did not come from this server's
 * own page. A Host header with no port at all is accepted only when it names loopback --
 * that shape shows up from local clients, not from a rebound attacker domain.
 */
export function checkRequestOrigin(
  headers: { host?: string; origin?: string },
  port: number
): OriginGuardResult {
  const host = headers.host ?? "";
  if (!host) return { allowed: false, reason: "missing Host header" };

  const hostname = hostnameOf(host);
  if (!LOOPBACK_HOSTS.includes(hostname)) {
    return {
      allowed: false,
      reason: `Host '${host}' is not loopback -- this API only answers to ${LOOPBACK_HOSTS.join(", ")} (DNS-rebinding guard)`,
    };
  }
  const hostPort = host.slice(hostname.length).replace(/^:/, "");
  if (hostPort && hostPort !== String(port)) {
    return { allowed: false, reason: `Host port '${hostPort}' is not this server's port (${port})` };
  }

  // No Origin at all: not a browser cross-site request. curl/scripts land here.
  const origin = headers.origin;
  if (origin === undefined || origin === "") return { allowed: true, reason: null };

  const allowedOrigins = LOOPBACK_HOSTS.map((h) => `http://${h}:${port}`);
  if (!allowedOrigins.includes(origin)) {
    return {
      allowed: false,
      reason: `cross-origin request from '${origin}' refused -- this API is only for the local GUI page`,
    };
  }
  return { allowed: true, reason: null };
}
