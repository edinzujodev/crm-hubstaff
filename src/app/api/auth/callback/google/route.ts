import { connection } from "next/server";
import { cookies } from "next/headers";
import { createSession, findApprovedUser, googleRedirectUri } from "@/lib/session";

const fail = (request: Request, error: string) => Response.redirect(new URL(`/login?error=${error}`, request.url));

type IdToken = { iss: string; aud: string; exp: number; email?: string; email_verified?: boolean; hd?: string };

// Step 2: Google sends the person back with a code. Exchange it, then let them in only if their
// email is on the approved list (the Team page) and, if AUTH_ALLOWED_DOMAIN is set, on that domain.
export async function GET(request: Request) {
  await connection();
  const params = new URL(request.url).searchParams;
  const jar = await cookies();
  const state = jar.get("oauth_state")?.value;
  const verifier = jar.get("oauth_verifier")?.value;
  jar.delete("oauth_state");
  jar.delete("oauth_verifier");

  if (params.get("error")) return fail(request, "cancelled");
  const code = params.get("code");
  if (!code || !state || !verifier || params.get("state") !== state) return fail(request, "failed");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: googleRedirectUri(request),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!res.ok) return fail(request, "failed");
  const { id_token } = (await res.json()) as { id_token?: string };
  if (!id_token) return fail(request, "failed");

  // The token came straight from Google's token endpoint over TLS, so reading its claims is enough (OIDC Core 3.1.3.7).
  const claims = JSON.parse(Buffer.from(id_token.split(".")[1], "base64url").toString()) as IdToken;
  const issuerOk = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
  if (!issuerOk || claims.aud !== process.env.GOOGLE_CLIENT_ID || claims.exp * 1000 < Date.now()) {
    return fail(request, "failed");
  }
  if (!claims.email || !claims.email_verified) return fail(request, "unverified");

  const domain = process.env.AUTH_ALLOWED_DOMAIN?.toLowerCase();
  if (domain && !claims.email.toLowerCase().endsWith(`@${domain}`)) return fail(request, "domain");

  const user = await findApprovedUser(claims.email);
  if (!user) return fail(request, "not_approved");

  await createSession(user.id);
  return Response.redirect(new URL("/", request.url));
}
