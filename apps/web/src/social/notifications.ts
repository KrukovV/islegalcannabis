import type { NotificationProvider } from "./providers";

export type SocialNotification = Parameters<NotificationProvider["notify"]>[0];

export function minimalNotificationPayload(input: SocialNotification) {
  if (!/^[0-9a-f-]{36,64}$/i.test(input.opaqueEntityId)) throw new Error("SOCIAL_NOTIFICATION_ENTITY_ID_INVALID");
  return {
    type: input.type,
    opaqueEntityId: input.opaqueEntityId,
  };
}

/**
 * Default adapter for the local candidate. It deliberately emits no push.
 * A future APNs/FCM/Web Push adapter receives only minimalNotificationPayload.
 */
export class DisabledMinimalNotificationProvider implements NotificationProvider {
  async notify(input: SocialNotification) {
    minimalNotificationPayload(input);
  }
}

let notificationProvider: NotificationProvider = new DisabledMinimalNotificationProvider();

export function getNotificationProvider() {
  return notificationProvider;
}

export function setNotificationProviderForTests(provider: NotificationProvider) {
  notificationProvider = provider;
  return () => { notificationProvider = new DisabledMinimalNotificationProvider(); };
}
