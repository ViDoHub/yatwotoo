import nodemailer from "nodemailer";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Send an email notification using SMTP settings from user_settings.
 */
export async function sendEmail(
  subject: string,
  body: string
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("user_settings")
    .select(
      "email_smtp_host, email_smtp_port, email_smtp_user, email_smtp_password, email_to"
    )
    .limit(1)
    .single();

  if (!data?.email_smtp_host || !data?.email_to) {
    console.warn("Email not configured");
    return false;
  }

  const { email_smtp_host, email_smtp_port, email_smtp_user, email_smtp_password, email_to } = data;

  const transporter = nodemailer.createTransport({
    host: email_smtp_host,
    port: email_smtp_port || 587,
    secure: email_smtp_port === 465,
    auth:
      email_smtp_user && email_smtp_password
        ? { user: email_smtp_user, pass: email_smtp_password }
        : undefined,
    connectionTimeout: 15000,
  });

  try {
    await transporter.sendMail({
      from: email_smtp_user || `yad2-alerts@${email_smtp_host}`,
      to: email_to,
      subject,
      text: body,
    });
    console.log(`Email sent to ${email_to}`);
    return true;
  } catch (e) {
    console.error("Error sending email:", e);
    return false;
  }
}
