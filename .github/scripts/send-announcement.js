import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ANNOUNCEMENT_FILE = fileURLToPath(new URL('../../announcement.json', import.meta.url));
const MAX_FCM_TTL_SECONDS = 28 * 24 * 60 * 60;
const ISO_EXPIRY_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export function createFcmMessage(announcement, now = Date.now()) {
  if (!announcement || typeof announcement !== 'object' || Array.isArray(announcement)) {
    throw new Error('announcement.json must contain a JSON object.');
  }

  const { id, title, message, expires } = announcement;
  if (typeof id !== 'string' || !id.trim()
    || typeof title !== 'string'
    || typeof message !== 'string'
    || typeof expires !== 'string'
    || !ISO_EXPIRY_PATTERN.test(expires)
    || !Number.isFinite(Date.parse(expires))) {
    throw new Error('announcement.json must include id, title, message, and an ISO expiry with a timezone.');
  }

  const expiresAt = Date.parse(expires);
  const active = message.trim().length > 0 && expiresAt > now;
  const ttlSeconds = active
    ? Math.max(1, Math.min(MAX_FCM_TTL_SECONDS, Math.floor((expiresAt - now) / 1000)))
    : 0;
  return {
    action: active ? 'show' : 'cancel',
    message: {
      topic: 'announcements',
      data: {
        action: active ? 'show' : 'cancel',
        id: id.trim(),
        title: title.trim() || 'Announcement',
        message: active ? message.trim() : '',
        expires,
      },
      android: {
        priority: 'HIGH',
        ttl: `${ttlSeconds}s`,
      },
    },
  };
}

export async function sendAnnouncementPush(
  announcement,
  {
    accessToken = process.env.FCM_ACCESS_TOKEN,
    projectId = process.env.FIREBASE_PROJECT_ID,
    request = fetch,
    now = Date.now(),
  } = {},
) {
  if (!accessToken) throw new Error('FCM_ACCESS_TOKEN is required.');
  if (!projectId || !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(projectId)) {
    throw new Error('FIREBASE_PROJECT_ID is missing or invalid.');
  }

  const push = createFcmMessage(announcement, now);
  const response = await request(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: push.message }),
    },
  );
  if (!response.ok) {
    const details = (await response.text()).slice(0, 1000);
    throw new Error(`Firebase Cloud Messaging returned HTTP ${response.status}${details ? `: ${details}` : '.'}`);
  }
  return push.action;
}

async function main() {
  const announcement = JSON.parse(await readFile(ANNOUNCEMENT_FILE, 'utf8'));
  const action = await sendAnnouncementPush(announcement);
  console.log(`Sent announcement ${action} push to the FCM topic.`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Announcement push failed.');
    process.exitCode = 1;
  });
}