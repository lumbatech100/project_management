export type MailSender = {
  email: string;
  name: string;
};

export function parseMailSenders(raw: unknown): MailSender[] {
  if (!Array.isArray(raw)) return [];
  const out: MailSender[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const email =
      typeof (row as { email?: unknown }).email === "string"
        ? (row as { email: string }).email.trim().toLowerCase()
        : "";
    const name =
      typeof (row as { name?: unknown }).name === "string"
        ? (row as { name: string }).name.trim()
        : "";
    if (!email) continue;
    out.push({ email, name });
  }
  return out;
}

/** Gabungkan mailSenders + legacy mailFrom/mailFromName */
export function resolveMailSenders(project: {
  mailSenders?: unknown;
  mailFrom?: string | null;
  mailFromName?: string | null;
}): MailSender[] {
  const fromJson = parseMailSenders(project.mailSenders);
  if (fromJson.length > 0) return fromJson;
  if (project.mailFrom?.trim()) {
    return [
      {
        email: project.mailFrom.trim().toLowerCase(),
        name: project.mailFromName?.trim() || "",
      },
    ];
  }
  return [];
}

export function formatFromHeader(sender: MailSender): string {
  if (sender.name) return `"${sender.name.replace(/"/g, "")}" <${sender.email}>`;
  return sender.email;
}
