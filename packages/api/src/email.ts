/**
 * Transactional email via Resend's HTTP API (no SDK).
 * Env: RESEND_API_KEY, EMAIL_FROM (e.g. "Docks <noreply@yourdomain.com>").
 * Without RESEND_API_KEY outside production, the email is printed to the
 * server log instead, so local sign-up and reset flows still work.
 */
export async function sendEmail(msg: { to: string; subject: string; html: string; text: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") throw new Error("RESEND_API_KEY is not set");
    console.log(`[email] (not sent, no RESEND_API_KEY) to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Docks <onboarding@resend.dev>",
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** One plain layout for every email: a line of text and one button. */
export function actionEmail(opts: { intro: string; action: string; url: string; outro?: string }) {
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:480px">
<p>${escape(opts.intro)}</p>
<p><a href="${escape(opts.url)}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${escape(opts.action)}</a></p>
<p style="color:#666;font-size:13px">${escape(opts.outro ?? "If you didn't expect this email, you can ignore it.")}</p>
</div>`;
  const text = `${opts.intro}\n\n${opts.action}: ${opts.url}\n\n${opts.outro ?? "If you didn't expect this email, you can ignore it."}`;
  return { html, text };
}
