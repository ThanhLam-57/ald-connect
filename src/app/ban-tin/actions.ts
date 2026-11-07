"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireActiveAccount } from "../../lib/auth";
import {
  acknowledgeAnnouncement,
  formText,
  isContentId,
  publishAnnouncement,
} from "../../lib/content";

export async function submitAnnouncement(form: FormData) {
  const account = await requireActiveAccount();
  if (account.role !== "HCNS") notFound();
  const title = formText(form, "title", 120);
  const body = formText(form, "body", 5000);
  if (!title || !body) redirect("/ban-tin?notice=invalid");

  publishAnnouncement(account, title, body);
  revalidatePath("/");
  revalidatePath("/ban-tin");
  redirect("/ban-tin?notice=published");
}

export async function confirmAnnouncementRead(form: FormData) {
  const account = await requireActiveAccount();
  if (account.role !== "LIVE") notFound();
  const id = form.get("announcement");
  if (!isContentId(id)) notFound();

  acknowledgeAnnouncement(account, id);
  revalidatePath("/");
  revalidatePath("/ban-tin");
}
