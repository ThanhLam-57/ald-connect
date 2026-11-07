import { getAccount } from "../../../lib/auth";
import { getWorkforceSource, readWorkforceLeaderboard } from "../../../lib/workforce";

const responseHeaders = { "Cache-Control": "private, no-store, max-age=0" };

function failure(status: number) {
  return new Response(null, { status, headers: responseHeaders });
}

export async function GET(request: Request) {
  const account = await getAccount();
  if (!account) return failure(401);
  const isAdmin = account.role === "ADMIN";
  if (!isAdmin && (account.role !== "LIVE" || !account.staffCode || !account.branchCode || !account.workforceSource)) {
    return failure(403);
  }

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope");
  const period = searchParams.get("period");
  const requestedBranch = searchParams.get("branchId");
  if ((scope !== "facility" && scope !== "company") || period !== "month") return failure(400);
  if (requestedBranch !== null && (scope !== "facility" || (!isAdmin && requestedBranch !== account.branchCode))) {
    return failure(403);
  }

  try {
    const source = getWorkforceSource();
    if (!source) return failure(503);
    if (!isAdmin && source !== account.workforceSource) return failure(403);

    const result = await readWorkforceLeaderboard(scope, {
      branchId: isAdmin ? requestedBranch : account.branchCode,
      staffCode: isAdmin ? null : account.staffCode,
      canChooseBranch: isAdmin,
    });
    if (!result) return failure(isAdmin && requestedBranch !== null ? 404 : 503);
    return Response.json(result, { headers: responseHeaders });
  } catch {
    return failure(503);
  }
}
