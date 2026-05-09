import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = process.env.FROM_EMAIL || 'FortuneFlow <onboarding@resend.dev>'
const APP_URL = process.env.APP_URL || 'http://localhost:5173'

export async function sendVerificationEmail(to: string, token: string, displayName: string) {
  const verifyUrl = `${APP_URL}/#/verify-email/${token}`

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: 'Verify your FortuneFlow account',
    html: `
      <div style="font-family:'Inter',system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="color:#1C1C1E;margin:0 0 8px">Welcome, ${displayName}!</h2>
        <p style="color:#636366;font-size:15px;line-height:1.6;margin:0 0 24px">
          Please verify your email address to start using FortuneFlow.
        </p>
        <a href="${verifyUrl}"
           style="display:inline-block;background:#5856D6;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
          Verify Email
        </a>
        <p style="color:#8E8E93;font-size:13px;margin:24px 0 0;line-height:1.5">
          This link expires in 24 hours.<br>
          If you didn't create this account, you can safely ignore this email.
        </p>
      </div>
    `,
  })
}

export async function sendPasswordResetEmail(to: string, token: string, displayName: string) {
  const resetUrl = `${APP_URL}/#/reset-password/${token}`

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: 'Reset your FortuneFlow password',
    html: `
      <div style="font-family:'Inter',system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="color:#1C1C1E;margin:0 0 8px">Hi ${displayName},</h2>
        <p style="color:#636366;font-size:15px;line-height:1.6;margin:0 0 24px">
          We received a request to reset your password. Click the button below to set a new one.
        </p>
        <a href="${resetUrl}"
           style="display:inline-block;background:#5856D6;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
          Reset Password
        </a>
        <p style="color:#8E8E93;font-size:13px;margin:24px 0 0;line-height:1.5">
          This link expires in 1 hour.<br>
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  })
}
