import { IEventHandler, IEvent } from "../base/event.interface";
import {
  UserRegisteredEvent,
  PasswordChangedEvent,
  PasswordResetRequestedEvent,
  EmailVerificationSentEvent,
} from "../domain/auth.events";
import {
  AccountLockedEvent,
  SuspiciousActivityEvent,
  SecurityAlertEvent,
} from "../domain/security.events";
import { ErrorOccurredEvent } from "../domain/system.events";

interface Notification {
  id: string;
  type: "email" | "sms" | "push" | "slack" | "webhook";
  recipient: string;
  subject: string;
  message: string;
  data?: Record<string, any>;
  priority: "low" | "normal" | "high" | "urgent";
  sentAt?: Date;
  status: "pending" | "sent" | "failed";
}

export class NotificationHandler implements IEventHandler {
  readonly eventType = "*"; // Listen to all events
  readonly handlerName = "NotificationHandler";

  private notifications: Notification[] = [];
  private emailQueue: Notification[] = [];

  async handle(event: IEvent): Promise<void> {
    const notification = this.createNotification(event);
    if (notification) {
      await this.sendNotification(notification);
    }
  }

  private createNotification(event: IEvent): Notification | null {
    const baseNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sentAt: undefined,
      status: "pending" as const,
    };

    switch (event.type) {
      case "user.registered":
        const regEvent = event as UserRegisteredEvent;
        return {
          ...baseNotification,
          type: "email",
          recipient: regEvent.payload.email,
          subject: "Welcome to Our Application!",
          message: `Hi ${regEvent.payload.name || "there"},\n\nThank you for registering! Your account has been created successfully.`,
          priority: "normal",
          data: {
            userId: regEvent.payload.userId,
            name: regEvent.payload.name,
          },
        };

      case "user.password_changed":
        const pwdEvent = event as PasswordChangedEvent;
        // Only notify for security-sensitive password changes
        if (event.metadata.userId) {
          return {
            ...baseNotification,
            type: "email",
            recipient: event.metadata.userId, // Would need to lookup email
            subject: "Password Changed Successfully",
            message:
              "Your password has been changed. If you did not make this change, please contact support immediately.",
            priority: "high",
            data: {
              userId: pwdEvent.payload.userId,
              changedAt: pwdEvent.payload.changedAt,
            },
          };
        }
        return null;

      case "user.password_reset_requested":
        const resetEvent = event as PasswordResetRequestedEvent;
        return {
          ...baseNotification,
          type: "email",
          recipient: resetEvent.payload.email,
          subject: "Password Reset Request",
          message: `Click the link below to reset your password. This link will expire in 1 hour.\n\nReset Token: ${resetEvent.payload.token}`,
          priority: "high",
          data: {
            userId: resetEvent.payload.userId,
            token: resetEvent.payload.token,
            expiresAt: resetEvent.payload.expiresAt,
          },
        };

      case "user.email_verification_sent":
        const verifyEvent = event as EmailVerificationSentEvent;
        return {
          ...baseNotification,
          type: "email",
          recipient: verifyEvent.payload.email,
          subject: "Verify Your Email Address",
          message: `Please verify your email address by clicking the link below.\n\nVerification Token: ${verifyEvent.payload.token}`,
          priority: "normal",
          data: {
            userId: verifyEvent.payload.userId,
            token: verifyEvent.payload.token,
          },
        };

      case "security.account_locked":
        const lockEvent = event as AccountLockedEvent;
        return {
          ...baseNotification,
          type: "email",
          recipient: lockEvent.payload.email,
          subject: "Account Locked - Security Alert",
          message: `Your account has been locked due to ${lockEvent.payload.reason}. Please contact support to unlock your account.`,
          priority: "urgent",
          data: {
            userId: lockEvent.payload.userId,
            reason: lockEvent.payload.reason,
            lockedUntil: lockEvent.payload.lockedUntil,
          },
        };

      case "security.suspicious_activity":
        const suspicious = event as SuspiciousActivityEvent;
        if (
          suspicious.payload.severity === "high" ||
          suspicious.payload.severity === "critical"
        ) {
          return {
            ...baseNotification,
            type: "slack", // Alert to admin channel
            recipient: "#security-alerts",
            subject: `⚠️ Suspicious Activity Detected - ${suspicious.payload.severity.toUpperCase()}`,
            message: `Type: ${suspicious.payload.activityType}\nUser: ${suspicious.payload.userId || "Unknown"}\nDetails: ${JSON.stringify(suspicious.payload.details)}`,
            priority: "urgent",
            data: suspicious.payload,
          };
        }
        return null;

      case "security.alert":
        const alert = event as SecurityAlertEvent;
        if (alert.payload.severity === "critical") {
          return {
            ...baseNotification,
            type: "slack",
            recipient: "#security-alerts",
            subject: `🚨 CRITICAL Security Alert: ${alert.payload.alertType}`,
            message: alert.payload.message,
            priority: "urgent",
            data: alert.payload.details,
          };
        }
        return null;

      case "system.error_occurred":
        const error = event as ErrorOccurredEvent;
        if (error.payload.severity === "critical") {
          return {
            ...baseNotification,
            type: "slack",
            recipient: "#system-errors",
            subject: `💥 Critical System Error: ${error.payload.errorType}`,
            message: `${error.payload.message}\n\nContext: ${JSON.stringify(error.payload.context)}`,
            priority: "urgent",
            data: {
              stack: error.payload.stack,
              context: error.payload.context,
            },
          };
        }
        return null;

      default:
        return null;
    }
  }

  private async sendNotification(notification: Notification): Promise<void> {
    try {
      switch (notification.type) {
        case "email":
          await this.sendEmail(notification);
          break;

        case "slack":
          await this.sendSlackMessage(notification);
          break;

        case "sms":
          await this.sendSMS(notification);
          break;

        case "push":
          await this.sendPushNotification(notification);
          break;

        case "webhook":
          await this.sendWebhook(notification);
          break;
      }

      notification.status = "sent";
      notification.sentAt = new Date();
    } catch (error) {
      console.error(`[NotificationHandler] Failed to send notification:`, {
        type: notification.type,
        recipient: notification.recipient,
        error,
      });
      notification.status = "failed";
    }

    // Store notification history
    this.notifications.push(notification);

    // Keep only last 1000 notifications
    if (this.notifications.length > 1000) {
      this.notifications.shift();
    }
  }

  private async sendEmail(notification: Notification): Promise<void> {
    // Queue email for batch sending
    this.emailQueue.push(notification);

    // In production, integrate with email service
    if (process.env.NODE_ENV === "production") {
      // await emailService.send({
      //   to: notification.recipient,
      //   subject: notification.subject,
      //   body: notification.message,
      //   data: notification.data
      // })
    } else {
      console.log(`[Email] To: ${notification.recipient}`, {
        subject: notification.subject,
        priority: notification.priority,
      });
    }
  }

  private async sendSlackMessage(notification: Notification): Promise<void> {
    // In production, integrate with Slack webhook
    if (process.env.NODE_ENV === "production") {
      // await slackClient.postMessage({
      //   channel: notification.recipient,
      //   text: notification.subject,
      //   attachments: [{ text: notification.message }]
      // })
    } else {
      console.log(`[Slack] ${notification.recipient}: ${notification.subject}`);
    }
  }

  private async sendSMS(notification: Notification): Promise<void> {
    // In production, integrate with SMS service (Twilio, etc.)
    console.log(`[SMS] To: ${notification.recipient}: ${notification.message}`);
  }

  private async sendPushNotification(
    notification: Notification,
  ): Promise<void> {
    // In production, integrate with push notification service
    console.log(
      `[Push] To: ${notification.recipient}: ${notification.subject}`,
    );
  }

  private async sendWebhook(notification: Notification): Promise<void> {
    // In production, send webhook
    console.log(`[Webhook] To: ${notification.recipient}`, notification.data);
  }

  /**
   * Process email queue (batch sending)
   */
  async processEmailQueue(): Promise<void> {
    if (this.emailQueue.length === 0) return;

    const batch = this.emailQueue.splice(0, 100); // Process up to 100 emails

    // In production, send batch emails
    console.log(`[NotificationHandler] Processing ${batch.length} emails`);

    for (const email of batch) {
      email.status = "sent";
      email.sentAt = new Date();
    }
  }

  /**
   * Get notification history
   */
  getNotifications(filters?: {
    type?: string;
    status?: string;
    priority?: string;
    limit?: number;
  }): Notification[] {
    let notifications = [...this.notifications];

    if (filters) {
      if (filters.type) {
        notifications = notifications.filter((n) => n.type === filters.type);
      }
      if (filters.status) {
        notifications = notifications.filter(
          (n) => n.status === filters.status,
        );
      }
      if (filters.priority) {
        notifications = notifications.filter(
          (n) => n.priority === filters.priority,
        );
      }
      if (filters.limit) {
        notifications = notifications.slice(-filters.limit);
      }
    }

    return notifications;
  }

  /**
   * Get notification statistics
   */
  getStats() {
    const stats = {
      total: this.notifications.length,
      byType: new Map<string, number>(),
      byStatus: new Map<string, number>(),
      byPriority: new Map<string, number>(),
      queueSize: this.emailQueue.length,
    };

    for (const notif of this.notifications) {
      // Count by type
      const typeCount = stats.byType.get(notif.type) || 0;
      stats.byType.set(notif.type, typeCount + 1);

      // Count by status
      const statusCount = stats.byStatus.get(notif.status) || 0;
      stats.byStatus.set(notif.status, statusCount + 1);

      // Count by priority
      const priorityCount = stats.byPriority.get(notif.priority) || 0;
      stats.byPriority.set(notif.priority, priorityCount + 1);
    }

    return stats;
  }
}
