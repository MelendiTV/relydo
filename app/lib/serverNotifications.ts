import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const vapidSubject = process.env.VAPID_SUBJECT;
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidSubject && vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

export type RelydoNotificationInput = {
  userId: string;
  type: string;
  title: string;
  message: string;
  titleEn?: string;
  messageEn?: string;
  requestId?: string | null;
  url?: string | null;
};

export type RelydoNotificationResult = {
  internalNotificationSaved: boolean;
  duplicateSkipped?: boolean;
  pushDevices: number;
  pushSent: number;
  pushFailed: number;
  pushRemoved: number;
  error?: string;
};

export async function sendRelydoNotification(
  input: RelydoNotificationInput
): Promise<RelydoNotificationResult> {
  const userId = input.userId?.trim();
  if (!userId) {
    return {
      internalNotificationSaved: false,
      pushDevices: 0,
      pushSent: 0,
      pushFailed: 0,
      pushRemoved: 0,
      error: "Falta userId.",
    };
  }

  const result: RelydoNotificationResult = {
    internalNotificationSaved: false,
    pushDevices: 0,
    pushSent: 0,
    pushFailed: 0,
    pushRemoved: 0,
  };

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("preferred_language")
    .eq("id", userId)
    .maybeSingle();

  const useEnglish = profile?.preferred_language === "en";
  const title = useEnglish && input.titleEn ? input.titleEn : input.title;
  const message = useEnglish && input.messageEn ? input.messageEn : input.message;
  const requestId = input.requestId || null;

  // Exact-event idempotency: retries do not create the same internal/push
  // notification twice. Different titles/messages for the same request remain valid.
  let duplicateQuery = supabaseAdmin
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("type", input.type)
    .eq("title", title)
    .eq("message", message);

  duplicateQuery = requestId
    ? duplicateQuery.eq("request_id", requestId)
    : duplicateQuery.is("request_id", null);

  const { data: existingNotification } = await duplicateQuery.limit(1).maybeSingle();

  if (existingNotification) {
    result.duplicateSkipped = true;
    return result;
  }

  const { error: notificationError } = await supabaseAdmin
    .from("notifications")
    .insert({
      user_id: userId,
      type: input.type,
      title,
      message,
      request_id: requestId,
      read: false,
    });

  if (notificationError) {
    console.error("RELYDO: no se pudo guardar la notificación interna:", notificationError);
    result.error = notificationError.message;
    return result;
  }

  result.internalNotificationSaved = true;

  if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
    return result;
  }

  const { data: subscriptions, error: subscriptionsError } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (subscriptionsError) {
    result.error = subscriptionsError.message;
    return result;
  }

  if (!subscriptions?.length) return result;
  result.pushDevices = subscriptions.length;

  const payload = JSON.stringify({
    title: title || "RELYDO",
    body: message || (useEnglish ? "You have a new notification." : "Tienes una nueva notificación."),
    url: input.url || (requestId ? `/mis-solicitudes/${requestId}` : "/"),
  });

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload
      );
      result.pushSent += 1;
    } catch (error: unknown) {
      result.pushFailed += 1;
      const pushError = error as { statusCode?: number; message?: string };
      if (pushError.statusCode === 404 || pushError.statusCode === 410) {
        const { error: deleteError } = await supabaseAdmin
          .from("push_subscriptions")
          .delete()
          .eq("id", subscription.id);
        if (!deleteError) result.pushRemoved += 1;
      }
    }
  }

  return result;
}
