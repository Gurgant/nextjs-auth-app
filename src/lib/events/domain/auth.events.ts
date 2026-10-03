import { BaseEvent } from "../base/event.base";
import { EventMetadata } from "../base/event.interface";

// Event payloads
export interface UserRegisteredPayload {
  userId: string;
  email: string;
  name?: string | null;
  provider: string;
  emailVerified: boolean;
  registeredAt: Date;
}

export interface PasswordChangedPayload {
  userId: string;
  changedAt: Date;
  requiresLogout?: boolean;
}

// Event classes
export class UserRegisteredEvent extends BaseEvent<UserRegisteredPayload> {
  readonly type = "user.registered";

  constructor(
    payload: UserRegisteredPayload,
    metadata?: Partial<EventMetadata>,
  ) {
    super(payload, metadata);
  }
}

export class PasswordChangedEvent extends BaseEvent<PasswordChangedPayload> {
  readonly type = "user.password_changed";

  constructor(
    payload: PasswordChangedPayload,
    metadata?: Partial<EventMetadata>,
  ) {
    super(payload, metadata);
  }
}
