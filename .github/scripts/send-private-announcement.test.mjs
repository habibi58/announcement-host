import assert from 'node:assert/strict';
import test from 'node:test';
import { sendPrivateAnnouncementPush } from './send-private-announcement.js';

const jobId = 'c44a6c2f-9ea1-4f4e-9dc0-e1e0f477cdda';
const now = Date.parse('2026-10-27T00:00:00Z');
const expires = '2026-10-28T04:00:00+08:00';

function documentResponse(fields) {
  return { ok: true, status: 200, json: async () => ({ fields }) };
}

function responseFor(url, options) {
  if (options.method === 'DELETE') return { ok: true, status: 200 };
  if (url.includes('/messages:send')) return { ok: true, status: 200 };
  if (url.includes('/privateAnnouncementPushJobs/')) {
    return documentResponse({
      userId: { stringValue: 'anonymous-user-123' },
      announcementId: { stringValue: 'private-message-123' },
    });
  }
  if (url.includes('/privateAnnouncements/')) {
    return documentResponse({
      title: { stringValue: 'Private notice' },
      message: { stringValue: 'Please review this update.' },
      expires: { stringValue: expires },
      expiresAt: { timestampValue: expires },
      readAt: { nullValue: null },
    });
  }
  if (url.endsWith('/documents/users/anonymous-user-123')) {
    return documentResponse({ fcmToken: { stringValue: 'private-fcm-token' } });
  }
  throw new Error(`Unexpected request: ${options.method || 'GET'} ${url}`);
}

test('sends an expiring high-priority FCM push without exposing message details in the workflow payload', async () => {
  const requests = [];
  const result = await sendPrivateAnnouncementPush(jobId, {
    accessToken: 'test-access-token',
    projectId: 'fintra-project',
    request: async (url, options = {}) => {
      requests.push({ url, options });
      return responseFor(url, options);
    },
    now,
  });

  assert.equal(result, 'sent');
  const fcmRequest = requests.find(({ url }) => url.includes('/messages:send'));
  assert.ok(fcmRequest);
  assert.equal(
    fcmRequest.url,
    'https://fcm.googleapis.com/v1/projects/fintra-project/messages:send',
  );
  assert.equal(fcmRequest.options.headers.Authorization, 'Bearer test-access-token');
  assert.deepEqual(JSON.parse(fcmRequest.options.body).message, {
    token: 'private-fcm-token',
    data: {
      type: 'private',
      id: 'private-message-123',
      title: 'Private notice',
      message: 'Please review this update.',
      expires,
    },
    android: {
      priority: 'HIGH',
      ttl: '72000s',
    },
  });
  assert.ok(requests.some(({ options }) => options.method === 'DELETE'));
});

test('skips and removes already acknowledged messages without sending a push', async () => {
  let pushSent = false;
  const result = await sendPrivateAnnouncementPush(jobId, {
    accessToken: 'test-access-token',
    projectId: 'fintra-project',
    request: async (url, options = {}) => {
      if (options.method === 'DELETE') return { ok: true, status: 200 };
      if (url.includes('/messages:send')) pushSent = true;
      if (url.includes('/privateAnnouncementPushJobs/')) {
        return documentResponse({
          userId: { stringValue: 'anonymous-user-123' },
          announcementId: { stringValue: 'private-message-123' },
        });
      }
      if (url.includes('/privateAnnouncements/')) {
        return documentResponse({
          title: { stringValue: 'Private notice' },
          message: { stringValue: 'Already seen.' },
          expires: { stringValue: expires },
          readAt: { timestampValue: expires },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    },
    now,
  });

  assert.equal(result, 'skipped');
  assert.equal(pushSent, false);
});

test('skips and removes the push job if its private message was removed first', async () => {
  let pushSent = false;
  let jobRemoved = false;
  const result = await sendPrivateAnnouncementPush(jobId, {
    accessToken: 'test-access-token',
    projectId: 'fintra-project',
    request: async (url, options = {}) => {
      if (options.method === 'DELETE') {
        jobRemoved = true;
        return { ok: true, status: 200 };
      }
      if (url.includes('/messages:send')) pushSent = true;
      if (url.includes('/privateAnnouncementPushJobs/')) {
        return documentResponse({
          userId: { stringValue: 'anonymous-user-123' },
          announcementId: { stringValue: 'private-message-123' },
        });
      }
      if (url.includes('/privateAnnouncements/')) return { ok: false, status: 404 };
      throw new Error(`Unexpected request: ${url}`);
    },
    now,
  });

  assert.equal(result, 'skipped');
  assert.equal(pushSent, false);
  assert.equal(jobRemoved, true);
});

test('does not send to a user without a registered device token', async () => {
  await assert.rejects(
    sendPrivateAnnouncementPush(jobId, {
      accessToken: 'test-access-token',
      projectId: 'fintra-project',
      request: async (url, options = {}) => {
        if (url.includes('/privateAnnouncementPushJobs/')) {
          return documentResponse({
            userId: { stringValue: 'anonymous-user-123' },
            announcementId: { stringValue: 'private-message-123' },
          });
        }
        if (url.includes('/privateAnnouncements/')) {
          return documentResponse({
            title: { stringValue: 'Private notice' },
            message: { stringValue: 'Hello.' },
            expires: { stringValue: expires },
            readAt: { nullValue: null },
          });
        }
        if (url.endsWith('/documents/users/anonymous-user-123')) {
          return documentResponse({});
        }
        throw new Error(`Unexpected request: ${options.method || 'GET'} ${url}`);
      },
      now,
    }),
    /no registered Android push token/,
  );
});

test('validates sender credentials and reports FCM delivery failures', async () => {
  await assert.rejects(
    sendPrivateAnnouncementPush(jobId, { projectId: 'fintra-project', now }),
    /FCM_ACCESS_TOKEN is required/,
  );
  await assert.rejects(
    sendPrivateAnnouncementPush('../invalid', {
      accessToken: 'test-access-token',
      projectId: 'fintra-project',
      now,
    }),
    /Private push job ID is invalid/,
  );
  await assert.rejects(
    sendPrivateAnnouncementPush(jobId, {
      accessToken: 'test-access-token',
      projectId: 'fintra-project',
      request: async (url, options = {}) => {
        if (url.includes('/messages:send')) return { ok: false, status: 403 };
        return responseFor(url, options);
      },
      now,
    }),
    /Firebase Cloud Messaging returned HTTP 403/,
  );
});
