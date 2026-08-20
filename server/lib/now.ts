// Effective "now" for a request. Returns an ISO string to be used as
// coalesce($n::timestamptz, now()) in SQL, or null meaning "use Postgres now()".
// X-Debug-Now is honored ONLY when DEBUG_MODE=true — never set that in production.
export function requestNow(req: Request): string | null {
  if (process.env.DEBUG_MODE !== 'true') return null;
  const h = req.headers.get('x-debug-now');
  if (!h) return null;
  const d = new Date(h);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}
