import { Resend } from "resend";
import { getSafeLocale } from "@/config/i18n";
import { isPublicPlaceholder } from "@/lib/env-rules";

// Real sending only with a real key; unset or the .env.example placeholder
// means "not configured" and sending is simulated (logged, not delivered).
const resendApiKey = process.env.RESEND_API_KEY;
const resend =
  resendApiKey && !isPublicPlaceholder(resendApiKey)
    ? new Resend(resendApiKey)
    : null;
const fromEmail = process.env.EMAIL_FROM || "noreply@authapp.com";

export interface EmailTemplate {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * A name as one line: every run of white space and control characters is one
 * space, and none stands at an end. With its line breaks kept, a name would
 * put lines of its own into the text part of a mail.
 */
function onOneLine(value: string): string {
  return value.replace(/[\s\p{Cc}]+/gu, " ").trim();
}

/**
 * A value as text for the HTML of a mail: none of its characters is markup,
 * in an element and in a quoted attribute alike.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Email verification template
export function createEmailVerificationTemplate(
  userEmail: string,
  userName: string,
  verificationLink: string,
  locale: string = "en",
): EmailTemplate {
  // appName: the name of the application as the pages of each language show
  // it (Layout.appTitle of messages/<locale>.json; a unit test compares the
  // two). greeting: a user without a name, or with a name of spaces only, is
  // greeted with the salutation alone, without a word in the place of the
  // name. The name is one line in both parts of the mail.
  const name = onOneLine(userName);
  const translations = {
    en: {
      appName: "Auth App",
      subject: "Verify your email address",
      greeting: (who: string) => (who ? `Hello ${who},` : "Hello,"),
      message: "Please click the button below to verify your email address.",
      button: "Verify Email",
      footer:
        "If you didn't create this account, you can safely ignore this email.",
      expires: "This link expires in 30 minutes.",
      alternative:
        "If the button doesn't work, copy and paste this link into your browser:",
    },
    es: {
      appName: "App de Autenticación",
      subject: "Verifica tu dirección de correo electrónico",
      greeting: (who: string) => (who ? `Hola, ${who}:` : "Hola:"),
      message:
        "Haz clic en el botón de abajo para verificar tu dirección de correo electrónico.",
      button: "Verificar correo electrónico",
      footer:
        "Si no creaste esta cuenta, puedes ignorar este correo sin problema.",
      expires: "Este enlace expira en 30 minutos.",
      alternative:
        "Si el botón no funciona, copia y pega este enlace en tu navegador:",
    },
    fr: {
      appName: "App d'authentification",
      subject: "Vérifiez votre adresse email",
      greeting: (who: string) => (who ? `Bonjour ${who},` : "Bonjour,"),
      message:
        "Veuillez cliquer sur le bouton ci-dessous pour vérifier votre adresse email.",
      button: "Vérifier l'adresse email",
      footer:
        "Si vous n'avez pas créé ce compte, vous pouvez ignorer cet email sans risque.",
      expires: "Ce lien expire dans 30 minutes.",
      alternative:
        "Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur\u00a0:",
    },
    it: {
      appName: "App di accesso",
      subject: "Verifica il tuo indirizzo email",
      greeting: (who: string) => (who ? `Ciao ${who},` : "Ciao,"),
      message:
        "Clicca sul pulsante qui sotto per verificare il tuo indirizzo email.",
      button: "Verifica email",
      footer:
        "Se non hai creato questo account, puoi ignorare tranquillamente questa email.",
      expires: "Questo link scade tra 30 minuti.",
      alternative:
        "Se il pulsante non funziona, copia e incolla questo link nel tuo browser:",
    },
    de: {
      appName: "Anmelde-App",
      subject: "E-Mail-Adresse verifizieren",
      greeting: (who: string) => (who ? `Hallo ${who},` : "Guten Tag,"),
      message:
        "Bitte klicken Sie auf die Schaltfläche unten, um Ihre E-Mail-Adresse zu verifizieren.",
      button: "E-Mail verifizieren",
      footer:
        "Falls Sie dieses Konto nicht erstellt haben, können Sie diese E-Mail einfach ignorieren.",
      expires: "Dieser Link läuft in 30 Minuten ab.",
      alternative:
        "Falls die Schaltfläche nicht funktioniert, kopieren Sie diesen Link und fügen Sie ihn in Ihren Browser ein:",
    },
  };

  const t =
    translations[locale as keyof typeof translations] || translations.en;

  // What is not a constant of this file is escaped where it goes into the
  // HTML: the name was typed at registration, and the link is an argument.
  const link = escapeHtml(verificationLink);

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
            <div class="logo">🔐 ${t.appName}</div>
          </div>
          <div class="content">
            <h2>${t.greeting(escapeHtml(name))}</h2>
            <p>${t.message}</p>
            <p style="text-align: center;">
              <a href="${link}" class="button">${t.button}</a>
            </p>
            <p style="color: #666; font-size: 14px;"><strong>${t.expires}</strong></p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="font-size: 14px; color: #666;">${t.alternative}</p>
            <p class="link">${link}</p>
          </div>
          <div class="footer">
            <p>${t.footer}</p>
          </div>
        </div>
      </body>
    </html>
  `;

  // The text part holds the name and the link as they are. It has no button:
  // the link stands on a line of its own under the words of the button, and
  // no colon leads to it (French would need a no-break space before one).
  const text = [
    t.greeting(name),
    "",
    t.message,
    "",
    t.button,
    verificationLink,
    "",
    t.expires,
    "",
    t.footer,
  ].join("\n");

  return {
    to: userEmail,
    subject: t.subject,
    html,
    text,
  };
}

// Security alert template
export function createSecurityAlertTemplate(
  userEmail: string,
  userName: string,
  alertType: "suspicious_login" | "password_changed" | "2fa_enabled",
  details: string,
  locale: string = "en",
): EmailTemplate {
  // The name and the sentence about what happened come from the caller: both
  // are escaped where they go into the HTML.
  const name = escapeHtml(onOneLine(userName));
  const translations = {
    en: {
      subject: "Security Alert - Your Account",
      greeting: name ? `Hello ${name},` : "Hello,",
      message: "We detected important activity on your account:",
      footer:
        "If this wasn't you, please contact the administrator of this site immediately.",
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
            <strong>${escapeHtml(details)}</strong><br>
            <small>${t.time}: ${escapeHtml(new Date().toLocaleString())}</small>
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
    if (!resend) {
      // Deliberately avoid logging recipient or body: they carry PII and
      // one-time verification links.
      console.warn(
        "RESEND_API_KEY not configured, simulating email send:",
        template.subject,
      );
      // Simulated sends report success so flows can be exercised locally.
      return true;
    }

    // The Resend SDK does not throw on API errors; it returns { error }.
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: template.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    if (error) {
      console.error("❌ Email provider rejected the message:", error.name);
      return false;
    }

    console.log("✅ Email sent successfully:", data?.id || "unknown");
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
  requestedLocale: string = "en",
): Promise<boolean> {
  // The locale becomes part of the link and of the e-mail's HTML: only a
  // supported one is used, anything else falls back to the default.
  const locale = getSafeLocale(requestedLocale);
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

// Helper function to send security alerts
export async function sendSecurityAlert(
  userEmail: string,
  userName: string,
  alertType: "suspicious_login" | "password_changed" | "2fa_enabled",
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
