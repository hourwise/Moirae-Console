/** Governed responses must never be retained by browser or intermediary caches. */
export function setNoStoreResponseHeaders(response: {
  setHeader(name: string, value: string): unknown;
}): void {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('Expires', '0');
  response.setHeader('X-Content-Type-Options', 'nosniff');
}
