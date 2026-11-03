import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const [uid, action = 'grant'] = process.argv.slice(2);
if (!uid || !['grant', 'revoke'].includes(action)) {
  console.error('Usage: node set-admin-claim.js <firebase-auth-uid> [grant|revoke]');
  process.exitCode = 1;
} else {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    console.error('Set GOOGLE_CLOUD_PROJECT to the Firebase project ID first.');
    process.exitCode = 1;
  } else {
    initializeApp({ projectId });
    const auth = getAuth();
    const user = await auth.getUser(uid);
    const claims = { ...user.customClaims };
    if (action === 'grant') claims.announcementAdmin = true;
    else delete claims.announcementAdmin;
    await auth.setCustomUserClaims(uid, claims);
    console.log(`Announcement admin access ${action === 'grant' ? 'granted to' : 'revoked from'} ${uid}.`);
  }
}
