import "server-only";
import { APP_NAME } from "@/lib/constants";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Sends an invitation email through Resend when RESEND_API_KEY is configured.
 * Returns false (and the UI shows a copyable link instead) when email is not
 * configured or delivery fails. Never throws, so invitations still work.
 */
export async function sendInvitationEmail(input: {
  to: string;
  inviterName: string;
  groupName: string;
  url: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: `${input.inviterName} invited you to "${input.groupName}" on ${APP_NAME}`,
        html: `<p>${escapeHtml(input.inviterName)} invited you to split expenses in <strong>${escapeHtml(
          input.groupName,
        )}</strong> on ${APP_NAME}.</p><p><a href="${escapeHtml(input.url)}">Join the group</a></p><p>This link expires in 7 days.</p>`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
