/** Prescribers can issue signed QR codes; everyone else is a patient. */
export type UserRole = "patient" | "prescriber";

/** The signed-in user as verified on the server from the session cookie. */
export interface SessionUser {
  uid: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
  /** Guest accounts created with Firebase anonymous sign-in. */
  isAnonymous: boolean;
  /** From the Firebase custom claim `role` (set with scripts/set-role.mjs). */
  role: UserRole;
}
