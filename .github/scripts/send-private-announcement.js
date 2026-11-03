import { pathToFileURL } from 'node:url';

const MAX_FCM_TTL_SECONDS = 28 * 24 * 60 * 60;
const FIRESTORE_API = 'https://firestore.googleapis.com/v1';
const FCM_API = 'https://fcm.googleapis.com/v1';

function requiredValue(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function validateId(value, name) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new Error(`${name} is invalid.`);
  }
  return value;
}

function firestoreDocumentUrl(projectId, path) {
  const documentPath = path.map((segment) => encodeURIComponent(segment)).join('/');
  return `${FIRESTORE_API}/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${documentPath}`;
}

function stringField(document, name) {
  const value = document?.fields?.[name]?.stringValue;
  return typeof value === 'string' ? value : '';
}

function isNullField(value) {
  return value !== null
    && typeof value === 'object'
    && Object.hasOwn(value, 'nullValue')
    && value.nullValue === null;
}

async function getDocument(projectId, path, accessToken, request, allowMissing = false) {
  const response = await request(firestoreDocumentUrl(projectId, path), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Firestore document lookup failed with HTTP ${response.status}.`);
  }
  return response.json();
}

async function deleteDocument(projectId, path, accessToken, request) {
  const response = await request(firestoreDocumentUrl(projectId, path), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Could not remove the processed private push job (HTTP ${response.status}).`);
  }
}

export async function sendPrivateAnnouncementPush(
  jobId,
  {
    accessToken = process.env.FCM_ACCESS_TOKEN,
    projectId = process.env.FIREBASE_PROJECT_ID,
    request = fetch,
    now = Date.now(),
  } = {},
) {
  const token = requiredValue(accessToken, 'FCM_ACCESS_TOKEN');
  const id = validateId(jobId, 'Private push job ID');
  const project = requiredValue(projectId, 'FIREBASE_PROJECT_ID');
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(project)) {
    throw new Error('FIREBASE_PROJECT_ID is invalid.');
  }

  const job = await getDocument(
    project,
    ['privateAnnouncementPushJobs', id],
    token,
    request,
  );
  const userId = validateId(stringField(job, 'userId'), 'Recipient ID');
  const announcementId = validateId(stringField(job, 'announcementId'), 'Announcement ID');
  const announcement = await getDocument(
    project,
    ['users', userId, 'privateAnnouncements', announcementId],
    token,
    request,
    true,
  );
  if (!announcement) {
    await deleteDocument(project, ['privateAnnouncementPushJobs', id], token, request);
    return 'skipped';
  }

  const fields = announcement.fields || {};
  const title = stringField(announcement, 'title').trim();
  const message = stringField(announcement, 'message').trim();
  const expires = stringField(announcement, 'expires');
  const expiresAt = Date.parse(expires);
  const readAt = fields.readAt;
  const unread = isNullField(readAt);
  if (!unread || !title || !message || !Number.isFinite(expiresAt) || expiresAt <= now) {
    await deleteDocument(project, ['privateAnnouncementPushJobs', id], token, request);
    return 'skipped';
  }

  const recipient = await getDocument(project, ['users', userId], token, request);
  const fcmToken = stringField(recipient, 'fcmToken');
  if (!fcmToken) {
    throw new Error('The recipient has no registered Android push token. Open Fintra online and allow notifications.');
  }

  const data = {
    type: 'private',
    id: announcementId,
    title,
    message,
    expires,
  };
  if (Buffer.byteLength(JSON.stringify(data), 'utf8') > 4096) {
    throw new Error('This private message is too large for an Android push notification.');
  }
  const ttlSeconds = Math.max(
    1,
    Math.min(MAX_FCM_TTL_SECONDS, Math.floor((expiresAt - now) / 1000)),
  );
  const response = await request(
    `${FCM_API}/projects/${encodeURIComponent(project)}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          data,
          android: {
            priority: 'HIGH',
            ttl: `${ttlSeconds}s`,
          },
        },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Firebase Cloud Messaging returned HTTP ${response.status}.`);
  }
  await deleteDocument(project, ['privateAnnouncementPushJobs', id], token, request);
  return 'sent';
}

async function main() {
  const result = await sendPrivateAnnouncementPush(process.env.PRIVATE_PUSH_JOB_ID);
  console.log(result === 'sent'
    ? 'Private Android notification sent to FCM.'
    : 'Private Android notification skipped because it is expired or already acknowledged.');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Private announcement push failed.');
    process.exitCode = 1;
  });
}
