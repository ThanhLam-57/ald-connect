"use server";

import { revalidatePath } from "next/cache";
import { AccountManagementError, changeManagedAccount } from "../../lib/accounts";

export type AccountActionState = {
  message?: string;
  error?: string;
  credentialPath?: string;
  credentialLifetime?: string;
};

export async function manageAccount(_: AccountActionState, data: FormData): Promise<AccountActionState> {
  function field(name: string) {
    const value = data.get(name);
    return typeof value === "string" ? value : "";
  }

  const intent = field("intent");
  const accountId = field("accountId");
  let result;
  try {
    switch (intent) {
      case "create":
        result = await changeManagedAccount({ intent, username: field("username"), displayName: field("displayName"), role: field("role") });
        break;
      case "role":
        result = await changeManagedAccount({ intent, accountId, role: field("role") });
        break;
      case "link":
        result = await changeManagedAccount({ intent, accountId, source: field("source"), staffCode: field("staffCode"), branchCode: field("branchCode") });
        break;
      case "manager":
        result = await changeManagedAccount({ intent, accountId, enabled: field("enabled") === "yes" });
        break;
      case "lock":
      case "unlock":
      case "invite":
      case "reset":
      case "revoke":
      case "unlink":
        result = await changeManagedAccount({ intent, accountId });
        break;
      default:
        return { error: "Thao tác tài khoản không hợp lệ." };
    }
  } catch (error) {
    if (error instanceof AccountManagementError) return { error: error.message };
    throw error;
  }

  revalidatePath("/tai-khoan");
  if (!result.credential) return { message: result.message };

  const prefix = process.env.NEXT_PUBLIC_CONNECT_BASE_PATH || "";
  const invite = result.credential.kind === "invite";
  const page = invite ? "/kich-hoat" : "/dat-lai-mat-khau";
  return {
    message: result.message,
    credentialPath: `${prefix}${page}?ma=${encodeURIComponent(result.credential.token)}`,
    credentialLifetime: invite ? "24 giờ" : "1 giờ",
  };
}
