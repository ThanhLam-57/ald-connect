"use server";

import { redirect } from "next/navigation";
import { authenticate, consumeAccountToken, validatePassword, type AccountTokenKind } from "../../lib/auth-store";
import { setSession } from "../../lib/auth";

export async function signIn(_state: string | null, form: FormData): Promise<string> {
  const username = form.get("username");
  const password = form.get("password");
  const token = typeof username === "string" && typeof password === "string"
    ? await authenticate(username, password)
    : null;
  if (!token) return "Không thể đăng nhập. Hãy kiểm tra thông tin hoặc thử lại sau.";
  await setSession(token);
  redirect("/");
}

async function setPassword(form: FormData, kind: AccountTokenKind): Promise<string> {
  const token = form.get("ma");
  const password = form.get("password");
  const confirmation = form.get("confirmation");
  if (typeof password !== "string" || typeof confirmation !== "string") {
    return "Vui lòng nhập và xác nhận mật khẩu.";
  }
  const error = validatePassword(password);
  if (error) return error;
  if (password !== confirmation) return "Mật khẩu xác nhận chưa khớp.";
  if (typeof token !== "string" || !(await consumeAccountToken(token, kind, password))) {
    return "Liên kết đã hết hạn, đã được dùng hoặc không còn hiệu lực. Hãy liên hệ người cấp tài khoản.";
  }
  redirect("/dang-nhap?mat-khau=da-luu");
}

export async function activateAccount(_state: string | null, form: FormData): Promise<string> {
  return setPassword(form, "invite");
}

export async function resetPassword(_state: string | null, form: FormData): Promise<string> {
  return setPassword(form, "reset");
}
