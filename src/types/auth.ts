/** The signed-in user as verified on the server from the session cookie. */
export interface SessionUser {
  uid: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
  /** Guest accounts created with Firebase anonymous sign-in. */
  isAnonymous: boolean;
}
