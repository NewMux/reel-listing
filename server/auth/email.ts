import { ENV } from "../_core/env";

type AuthEmail = { to: string; subject: string; text: string; html: string };

function layout(heading: string, body: string, actionLabel: string, actionUrl: string) {
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:520px;margin:0 auto;padding:24px">
<h2 style="margin:0 0 16px">${heading}</h2>
<p style="line-height:1.5">${body}</p>
<p style="margin:24px 0"><a href="${actionUrl}" style="background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">${actionLabel}</a></p>
<p style="color:#666;font-size:13px;line-height:1.5">If the button doesn't work, paste this link into your browser:<br>${actionUrl}</p>
<p style="color:#666;font-size:13px">If you didn't request this, you can ignore this email.</p>
</body></html>`;
}

async function send(message: AuthEmail) {
  if (!ENV.email || !ENV.emailFrom) {
    // Local development without an email binding: surface the link in the Worker log instead.
    console.warn(`[Email] not configured; would send "${message.subject}" to ${message.to}:\n${message.text}`);
    return;
  }
  await ENV.email.send({
    from: { name: "Reel Listing", email: ENV.emailFrom },
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}

export function sendVerificationEmail(to: string, token: string) {
  const url = `${ENV.publicUrl}/verify-email?token=${encodeURIComponent(token)}`;
  return send({
    to,
    subject: "Confirm your Reel Listing account",
    text: `Confirm your email to finish creating your Reel Listing account:\n\n${url}\n\nThis link expires in 24 hours.`,
    html: layout("Confirm your email", "Confirm your email to finish creating your Reel Listing account. This link expires in 24 hours.", "Confirm email", url),
  });
}

export function sendPasswordResetEmail(to: string, token: string) {
  const url = `${ENV.publicUrl}/reset-password?token=${encodeURIComponent(token)}`;
  return send({
    to,
    subject: "Reset your Reel Listing password",
    text: `Use this link to choose a new password:\n\n${url}\n\nThis link expires in 1 hour.`,
    html: layout("Reset your password", "Use the button below to choose a new password. This link expires in 1 hour.", "Choose a new password", url),
  });
}
