import { Resend } from "resend";

// Conditional Resend initialization to prevent crashes in development
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;
const fromEmail = process.env.EMAIL_FROM || "noreply@authapp.com";

export interface EmailTemplate {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// Email verification template
export function createEmailVerificationTemplate(
  userEmail: string,
  userName: string,
  verificationLink: string,
  locale: string = "en",
): EmailTemplate {
  const translations = {
    en: {
      subject: "Verify your email address",
      greeting: `Hello ${userName || "there"},`,
      message: "Please click the button below to verify your email address.",
      button: "Verify Email",
      footer:
        "If you didn't create this account, you can safely ignore this email.",
      expires: "This link expires in 30 minutes.",
      alternative:
        "If the button doesn't work, copy and paste this link into your browser:",
    },
    es: {
      subject: "Verifica tu dirección de correo",
      greeting: `Hola ${userName || "usuario"},`,
      message:
        "Por favor haz clic en el botón de abajo para verificar tu dirección de correo.",
      button: "Verificar Correo",
      footer:
        "Si no creaste esta cuenta, puedes ignorar este correo de manera segura.",
      expires: "Este enlace expira en 30 minutos.",
      alternative:
        "Si el botón no funciona, copia y pega este enlace en tu navegador:",
    },
    fr: {
      subject: "Vérifiez votre adresse e-mail",
      greeting: `Bonjour ${userName || "utilisateur"},`,
      message:
        "Veuillez cliquer sur le bouton ci-dessous pour vérifier votre adresse e-mail.",
      button: "Vérifier l'e-mail",
      footer:
        "Si vous n'avez pas créé ce compte, vous pouvez ignorer cet e-mail en toute sécurité.",
      expires: "Ce lien expire dans 30 minutes.",
      alternative:
        "Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur:",
    },
    it: {
      subject: "Verifica il tuo indirizzo email",
      greeting: `Ciao ${userName || "utente"},`,
      message:
        "Per favore clicca sul pulsante qui sotto per verificare il tuo indirizzo email.",
      button: "Verifica Email",
      footer:
        "Se non hai creato questo account, puoi ignorare questa email in sicurezza.",
      expires: "Questo link scade tra 30 minuti.",
      alternative:
        "Se il pulsante non funziona, copia e incolla questo link nel tuo browser:",
    },
    de: {
      subject: "E-Mail-Adresse bestätigen",
      greeting: `Hallo ${userName || "Benutzer"},`,
      message:
        "Bitte klicken Sie auf die Schaltfläche unten, um Ihre E-Mail-Adresse zu bestätigen.",
      button: "E-Mail bestätigen",
      footer:
        "Falls Sie dieses Konto nicht erstellt haben, können Sie diese E-Mail sicher ignorieren.",
      expires: "Dieser Link läuft in 30 Minuten ab.",
      alternative:
        "Falls die Schaltfläche nicht funktioniert, kopieren Sie diesen Link und fügen Sie ihn in Ihren Browser ein:",
    },
  };

  const t =
    translations[locale as keyof typeof translations] || translations.en;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${t.subject}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }
          .logo { font-size: 24px; font-weight: bold; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
          .content { padding: 30px 0; }
          .button { display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 6px; font-weight: 500; margin: 20px 0; }
          .footer { padding: 20px 0; border-top: 1px solid #eee; color: #666; font-size: 14px; }
          .link { color: #667eea; word-break: break-all; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🔐 Auth App</div>
          </div>
          <div class="content">
            <h2>${t.greeting}</h2>
            <p>${t.message}</p>
            <p style="text-align: center;">
              <a href="${verificationLink}" class="button">${t.button}</a>
            </p>
            <p style="color: #666; font-size: 14px;"><strong>${t.expires}</strong></p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="font-size: 14px; color: #666;">${t.alternative}</p>
            <p class="link">${verificationLink}</p>
          </div>
          <div class="footer">
            <p>${t.footer}</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `
    ${t.greeting}
    
    ${t.message}
    
    ${t.button}: ${verificationLink}
    
    ${t.expires}
    
    ${t.footer}
  `;

  return {
    to: userEmail,
    subject: t.subject,
    html,
    text,
  };
}

// Account linking notification template
export function createAccountLinkTemplate(
  userEmail: string,
  userName: string,
  linkType: "google" | "email",
  confirmationLink: string,
  locale: string = "en",
): EmailTemplate {
  const translations = {
    en: {
      subject: "Account Linking Request",
      greeting: `Hello ${userName || "there"},`,
      message:
        linkType === "google"
          ? "Someone requested to link a Google account to your email account."
          : "Someone requested to link an email/password account to your Google account.",
      button: "Confirm Account Linking",
      security:
        "If this wasn't you, please ignore this email or contact support.",
      expires: "This link expires in 15 minutes.",
    },
    // Add other languages as needed
  };

  const t =
    translations[locale as keyof typeof translations] || translations.en;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${t.subject}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .button { display: inline-block; padding: 12px 30px; background: #4CAF50; color: white; text-decoration: none; border-radius: 6px; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 6px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>${t.greeting}</h2>
          <p>${t.message}</p>
          <p><a href="${confirmationLink}" class="button">${t.button}</a></p>
          <div class="warning">
            <strong>⚠️ ${t.security}</strong>
          </div>
          <p><small>${t.expires}</small></p>
        </div>
      </body>
    </html>
  `;

  return {
    to: userEmail,
    subject: t.subject,
    html,
  };
}

// Security alert template
export function createSecurityAlertTemplate(
  userEmail: string,
  userName: string,
  alertType:
    | "suspicious_login"
    | "password_changed"
    | "2fa_enabled"
    | "account_linked",
  details: string,
  locale: string = "en",
): EmailTemplate {
  const translations = {
    en: {
      subject: "Security Alert - Your Account",
      greeting: `Hello ${userName || "there"},`,
      message: "We detected important activity on your account:",
      footer: "If this wasn't you, please contact support immediately.",
      time: "Time",
      action: "Review Account",
    },
    // Add other languages as needed
  };

  const t =
    translations[locale as keyof typeof translations] || translations.en;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${t.subject}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .alert { background: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 6px; margin: 20px 0; color: #721c24; }
          .button { display: inline-block; padding: 12px 30px; background: #dc3545; color: white; text-decoration: none; border-radius: 6px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>🚨 ${t.subject}</h2>
          <p>${t.greeting}</p>
          <p>${t.message}</p>
          <div class="alert">
            <strong>${details}</strong><br>
            <small>${t.time}: ${new Date().toLocaleString()}</small>
          </div>
          <p style="color: #dc3545;"><strong>${t.footer}</strong></p>
        </div>
      </body>
    </html>
  `;

  return {
    to: userEmail,
    subject: t.subject,
    html,
  };
}

// Send email function
export async function sendEmail(template: EmailTemplate): Promise<boolean> {
  try {
    if (!resend || !process.env.RESEND_API_KEY) {
      console.warn("⚠️ RESEND_API_KEY not configured, simulating email send");
      console.log("📧 Email that would be sent:", {
        to: template.to,
        subject: template.subject,
        preview: template.html.substring(0, 200) + "...",
      });
      // Return true in development to not break flows
      return true;
    }

    const data = await resend.emails.send({
      from: fromEmail,
      to: template.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    console.log("✅ Email sent successfully:", data.data?.id || "unknown");
    return true;
  } catch (error) {
    console.error("❌ Failed to send email:", error);
    return false;
  }
}

// Helper function to send verification email
export async function sendVerificationEmail(
  userEmail: string,
  userName: string,
  token: string,
  locale: string = "en",
): Promise<boolean> {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const verificationLink = `${baseUrl}/${locale}/verify-email/${token}`;

  const template = createEmailVerificationTemplate(
    userEmail,
    userName,
    verificationLink,
    locale,
  );
  return await sendEmail(template);
}

// Helper function to send account linking confirmation
export async function sendAccountLinkConfirmation(
  userEmail: string,
  userName: string,
  linkType: "google" | "email",
  token: string,
  locale: string = "en",
): Promise<boolean> {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const confirmationLink = `${baseUrl}/${locale}/link-account/confirm/${token}`;

  const template = createAccountLinkTemplate(
    userEmail,
    userName,
    linkType,
    confirmationLink,
    locale,
  );
  return await sendEmail(template);
}

// Helper function to send security alerts
export async function sendSecurityAlert(
  userEmail: string,
  userName: string,
  alertType:
    | "suspicious_login"
    | "password_changed"
    | "2fa_enabled"
    | "account_linked",
  details: string,
  locale: string = "en",
): Promise<boolean> {
  const template = createSecurityAlertTemplate(
    userEmail,
    userName,
    alertType,
    details,
    locale,
  );
  return await sendEmail(template);
}
