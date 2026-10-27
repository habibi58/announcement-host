import assert from 'node:assert/strict';
import test from 'node:test';
import { createFcmMessage, sendAnnouncementPush } from './send-announcement.js';

const activeAnnouncement = {
  id: 'ann-20261027-010000',
  title: 'Notice',
  message: 'Hello Fintra users',
  expires: '2026-10-28T04:00:00+08:00',
};
const now = Date.parse('2026-10-27T00:00:00Z');

test('creates a high-priority topic push for an active announcement', () => {
  const push = createFcmMessage(activeAnnouncement, now);

  assert.equal(push.action, 'show');
  assert.equal(push.message.topic, 'announcements');
  assert.equal(push.message.android.priority, 'HIGH');
  assert.equal(push.message.android.ttl, '72000s');
  assert.deepEqual(push.message.data, {
    action: 'show',
    id: activeAnnouncement.id,
    title: activeAnnouncement.title,
    message: activeAnnouncement.message,
    expires: activeAnnouncement.expires,
  });
});

test('sends a cancellation push for a stopped or expired announcement', () => {
  const stopped = createFcmMessage({ ...activeAnnouncement, message: '' }, now);
  const expired = createFcmMessage(
    { ...activeAnnouncement, expires: '2026-10-26T04:00:00+08:00' },
    now,
  );

  assert.equal(stopped.action, 'cancel');
  assert.equal(stopped.message.android.ttl, '0s');
  assert.equal(stopped.message.data.message, '');
  assert.equal(expired.action, 'cancel');
});

test('rejects malformed announcement data instead of reporting a push', () => {
  assert.throws(
    () => createFcmMessage({ ...activeAnnouncement, expires: 'tomorrow' }, now),
    /ISO expiry/,
  );
  assert.throws(() => createFcmMessage(null, now), /JSON object/);
});

test('sends only to the FCM topic and reports HTTP failures', async () => {
  let requestUrl = '';
  let requestOptions;
  const action = await sendAnnouncementPush(activeAnnouncement, {
    accessToken: 'test-token',
    projectId: 'fintra-project',
    request: async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return { ok: true, status: 200, text: async () => '' };
    },
    now,
  });

  assert.equal(action, 'show');
  assert.equal(requestUrl, 'https://fcm.googleapis.com/v1/projects/fintra-project/messages:send');
  assert.equal(requestOptions.headers.Authorization, 'Bearer test-token');
  assert.equal(JSON.parse(requestOptions.body).message.topic, 'announcements');

  await assert.rejects(
    sendAnnouncementPush(activeAnnouncement, {
      accessToken: 'test-token',
      projectId: 'fintra-project',
      request: async () => ({ ok: false, status: 403, text: async () => 'permission denied' }),
      now,
    }),
    /HTTP 403: permission denied/,
  );
});

test('requires a server-side Firebase token and project ID', async () => {
  await assert.rejects(
    sendAnnouncementPush(activeAnnouncement, { projectId: 'fintra-project', now }),
    /FCM_ACCESS_TOKEN is required/,
  );
  await assert.rejects(
    sendAnnouncementPush(activeAnnouncement, { accessToken: 'test-token', now }),
    /FIREBASE_PROJECT_ID is missing or invalid/,
  );
});