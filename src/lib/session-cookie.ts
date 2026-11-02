/**
 * Session cookie name, shared by the proxy and the server auth helpers.
 * `__Host-` pins the cookie to this exact origin over HTTPS. Safari refuses
 * Secure cookies on http://localhost, so development uses a plain name.
 */
export const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-veridose_session" : "veridose_session";
