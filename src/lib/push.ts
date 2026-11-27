import * as webpush from "web-push";
import { prisma } from "./db";

// Web push: sends notifications to the browsers and installed apps a user
// turned notifications on in. Keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

export function pushPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export function hasPush() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:noreply@example.com",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

export type DeviceInput = { endpoint: string; keys: { p256dh: string; auth: string } };

export function isDeviceInput(v: unknown): v is DeviceInput {
  const d = v as DeviceInput;
  return (
    typeof d?.endpoint === "string" &&
    /^https:\/\//.test(d.endpoint) &&
    typeof d.keys?.p256dh === "string" &&
    typeof d.keys?.auth === "string"
  );
}

export async function saveDevice(userId: string, device: DeviceInput, userAgent?: string | null) {
  const data = { userId, p256dh: device.keys.p256dh, auth: device.keys.auth, userAgent: userAgent?.slice(0, 300) ?? null };
  await prisma.pushDevice.upsert({ where: { endpoint: device.endpoint }, create: { endpoint: device.endpoint, ...data }, update: data });
}

export async function removeDevice(userId: string, endpoint: string) {
  await prisma.pushDevice.deleteMany({ where: { userId, endpoint } });
}

/**
 * Sends one notification to every device of a user. Devices the push service
 * says are gone (the person unsubscribed or cleared site data) are removed.
 * Returns how many devices it reached.
 */
export async function pushToUser(userId: string, payload: PushPayload) {
  if (!hasPush()) return 0;
  configure();
  const devices = await prisma.pushDevice.findMany({ where: { userId } });
  let delivered = 0;
  await Promise.all(
    devices.map(async (d) => {
      try {
        await webpush.sendNotification(
          { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24, urgency: "normal" },
        );
        delivered++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushDevice.delete({ where: { id: d.id } }).catch(() => {});
        } else {
          console.error(`[push] send failed (${status ?? "no status"})`, err instanceof Error ? err.message : err);
        }
      }
    }),
  );
  return delivered;
}
