import type { NudgeAction, NudgeContactInput } from "@/lib/nudge/engine";
import { rankNudges } from "@/lib/nudge/engine";
import { attachOpeners, type OpenerContext } from "@/lib/llm/openers";
import type { ActionItem, ContactStatus } from "@/lib/db/types";
import { todayIso } from "@/lib/utils/format";

export function contactsToNudgeInputs(
  statuses: ContactStatus[],
  actions: ActionItem[],
  summaries: Map<string, string>,
): { inputs: NudgeContactInput[]; contexts: Map<string, OpenerContext> } {
  const actionsByContact = new Map<string, ActionItem[]>();
  for (const a of actions) {
    const list = actionsByContact.get(a.contact_id) ?? [];
    list.push(a);
    actionsByContact.set(a.contact_id, list);
  }

  const contexts = new Map<string, OpenerContext>();
  const inputs: NudgeContactInput[] = statuses.map((s) => {
    const open = actionsByContact.get(s.contact_id) ?? [];
    const input: NudgeContactInput = {
      contact_id: s.contact_id,
      name: s.name,
      company: s.company,
      tier: s.tier,
      stage: s.stage,
      snoozed_until: s.snoozed_until,
      days_overdue: Number(s.days_overdue) || 0,
      next_due_date: s.next_due_date,
      upcoming_chat_at: s.upcoming_chat_at ?? null,
      open_actions: open.map((a) => ({
        description: a.description,
        owner: a.owner,
        due_date: a.due_date,
      })),
      last_summary: summaries.get(s.contact_id) ?? null,
    };
    const thread = input.open_actions
      .filter((a) => a.owner === "me")
      .map((a) => a.description)
      .join("; ");
    contexts.set(s.contact_id, {
      contact_id: s.contact_id,
      name: s.name,
      company: s.company,
      last_summary: input.last_summary,
      open_thread: thread || null,
      reason: "",
    });
    return input;
  });

  return { inputs, contexts };
}

export async function rankAndAttachOpeners(
  inputs: NudgeContactInput[],
  contexts: Map<string, OpenerContext>,
  opts: { today?: string; withOpeners?: boolean } = {},
): Promise<NudgeAction[]> {
  const today = opts.today ?? todayIso();
  let nudges = rankNudges(inputs, { today });
  for (const n of nudges) {
    const ctx = contexts.get(n.contact_id);
    if (ctx) ctx.reason = n.reason;
  }
  if (opts.withOpeners !== false && nudges.length > 0) {
    nudges = await attachOpeners(nudges, contexts, 3);
  }
  return nudges;
}
