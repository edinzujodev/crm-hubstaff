import { sessionUser } from "@/lib/session";

/** Who is signed in, from the session cookie. */
export async function getCurrentUser() {
  return sessionUser();
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Sign in first.");
  return user;
}
