export function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname.endsWith('.localhost') || /^127\./.test(hostname) || ['0.0.0.0', '[::1]', '::1'].includes(hostname);
}
export function validateServerUrl(value: string, allowLocal: boolean): string {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use the server base URL only, without credentials, path or query.');
  if (isLoopback(url.hostname)) {
    if (!allowLocal || !['http:', 'https:'].includes(url.protocol)) throw new Error('The public client cannot connect to localhost.');
  } else if (url.protocol !== 'https:') throw new Error('A hosted server requires HTTPS.');
  return url.origin;
}
export function defaultServerUrl(dev: boolean, hostname: string, configured = ''): string {
  if (configured) return validateServerUrl(configured, dev && isLoopback(hostname));
  return dev && isLoopback(hostname) ? 'http://localhost:3001' : '';
}
