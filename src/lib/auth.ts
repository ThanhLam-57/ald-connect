import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findSessionAccount, revokeSession, SESSION_TTL } from "./auth-store";

export type { Account, Role } from "./auth-store";

const SESSION_COOKIE = "ald-connect-session";
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: process.env.NEXT_PUBLIC_CONNECT_BASE_PATH || "/",
};

export async function getSessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function getAccount() {
  const token = await getSessionToken();
  return token ? findSessionAccount(token) : null;
}

export async function requireAccount() {
  const account = await getAccount();
  if (!account) redirect("/dang-nhap");
  return account;
}

export async function requireActiveAccount() {
  const account = await requireAccount();
  if (account.role === "LIVE" && (!account.staffCode || !account.workforceSource || !account.branchCode)) {
    redirect("/cho-gan");
  }
  return account;
}

export async function setSession(rawToken: string) {
  const cookieStore = await cookies();
  const prior = cookieStore.get(SESSION_COOKIE)?.value;
  if (prior) revokeSession(prior);
  cookieStore.set(SESSION_COOKIE, rawToken, { ...cookieOptions, maxAge: SESSION_TTL / 1000 });
}

export async function logout() {
  "use server";
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (rawToken) revokeSession(rawToken);
  cookieStore.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  redirect("/dang-nhap");
}
