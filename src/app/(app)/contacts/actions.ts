"use server";

import { revalidatePath } from "next/cache";
import { insertContact } from "@/lib/db/contacts";

export type QuickAddState = {
  status: "idle" | "ok" | "error";
  message?: string;
};

export async function quickAddContact(
  _prev: QuickAddState,
  formData: FormData,
): Promise<QuickAddState> {
  const name = String(formData.get("name") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim() || null;
  if (!name) {
    return { status: "error", message: "Name is required." };
  }

  try {
    await insertContact({
      name,
      company,
      title: null,
      email: null,
      linkedin_url: null,
      vertical: null,
      tier: "warm",
      stage: "identified",
    });
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Could not add contact.",
    };
  }

  revalidatePath("/contacts");
  return { status: "ok" };
}
