export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function err(status: number, message: string, extra?: Record<string, unknown>): Response {
  return json({ error: message, ...extra }, status);
}

// NUMERIC comes back from pg as a string; expose numbers to clients.
export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
