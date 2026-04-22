/**
 * Utility for resolving backend API URLs
 */

// In development, we use relative URLs if VITE_API_URL is not set because of Vite proxy
// In production, we use VITE_API_URL or fallback to relative (same origin)
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * Resolves an endpoint to a full URL.
 * If endpoint starts with / and API_BASE_URL is set, it prepends it.
 * Otherwise returns the endpoint as is (relative).
 */
export function getApiUrl(endpoint: string): string {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  // FORCE relative paths in development/preview to ensure 
  // we hit the AI Studio local backend and NOT a potentially protected external backend.
  if (import.meta.env.DEV) {
    return path;
  }

  const API_BASE_URL = import.meta.env.VITE_API_URL || '';
  if (API_BASE_URL) {
    const base = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    return `${base}${path}`;
  }
  
  return path;
}
