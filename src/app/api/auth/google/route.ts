import { createHash, randomBytes } from "node:crypto";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { authMode, googleRedirectUri } from "@/lib/session";

const b64url = (b: Buffer) => b.toString("base64url");

// Step 1 of "Sign in with Google": send the person to Google (authorization code flow with PKCE).
export async function GET(request: Request) {
  await connection();
  if (authMode() !== "google") return Response.redirect(new URL("/login", request.url));

  const state = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());

  const jar = await cookies();
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/api/auth", maxAge: 600 };
  jar.set("oauth_state", state, opts);
  jar.set("oauth_verifier", verifier, opts);

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(request),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
    ...(process.env.AUTH_ALLOWED_DOMAIN ? { hd: process.env.AUTH_ALLOWED_DOMAIN } : {}),
  }).toString();
  return Response.redirect(url);
}
