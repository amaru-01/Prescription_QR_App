/**
 * Web Push endpoints are chosen by the browser, but the server later POSTs to
 * them. Accept only the push services real browsers use, so a signed-in user
 * cannot aim the server at an arbitrary host.
 *
 * Each entry is an exact hostname, or a ".suffix" that matches any subdomain.
 * Extra hosts for self-hosted push services: PUSH_ALLOWED_HOSTS="a.example,.b.example".
 */
const BUILT_IN_HOSTS = [
  "fcm.googleapis.com", // Chrome, Edge, Opera, Brave, Samsung Internet
  ".push.services.mozilla.com", // Firefox
  ".notify.windows.com", // legacy Edge / Windows
  "web.push.apple.com", // Safari / iOS web push
  ".push.apple.com",
];

function allowedHosts(): string[] {
  const extra = (typeof process !== "undefined" ? process.env.PUSH_ALLOWED_HOSTS : "") ?? "";
  return [...BUILT_IN_HOSTS, ...extra.split(",").map((host) => host.trim().toLowerCase()).filter(Boolean)];
}

/** True when `endpoint` is an https URL on a known push service, with no credentials or custom port. */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;

  const host = url.hostname.toLowerCase();
  return allowedHosts().some((entry) =>
    entry.startsWith(".") ? host.endsWith(entry) && host.length > entry.length : host === entry
  );
}

/** Most push subscriptions (browsers/devices) one account may register. */
export const MAX_PUSH_SUBSCRIPTIONS = 10;
