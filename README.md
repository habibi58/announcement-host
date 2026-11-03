# Fintra Announcement Host

This folder contains the public `announcement.json` file read by Fintra. GitHub Pages serves the JSON, and a GitHub Actions workflow sends Android push notifications after the file changes.

Private one-to-one announcements use Firebase Authentication and Firestore. They are stored under the selected recipient's authenticated UID and are not written to this public JSON file or sent to the public FCM topic.

## Publish with GitHub Pages

1. Create a new GitHub repository for this folder and push these files to its `main` branch.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the `main` branch and `/ (root)` folder, then save.
5. After Pages finishes deploying, the announcement URL will look like:
   `https://<username>.github.io/<repo>/announcement.json`
6. Copy that exact HTTPS URL into `ANNOUNCEMENT_URL` in the app at `src/config/announcement.ts`, then build and distribute the app.

GitHub Pages can take a few minutes to publish or refresh a changed file. The app adds a cache-busting query and asks the browser not to cache the request, but hosting/CDN caches can still take a short time to update.

To publish a notice, replace `announcement.json`, then commit and push the change to `main`. To stop showing a notice, publish an empty `message` or an expired `expires` value.

## Enable Android push notifications

Push delivery uses Firebase Cloud Messaging (FCM); GitHub Pages by itself cannot wake an app that is in the background.

1. In Firebase, register an Android app with package ID `com.budgettrack.finance`, enable the Firebase Cloud Messaging API, and download its `google-services.json`.
2. Place `google-services.json` at `android/app/google-services.json` in the Fintra app repository before building the APK. The file is ignored by Git and must be present in the environment that builds the app.
3. Create a Google service account with the Firebase Cloud Messaging API Admin and Cloud Datastore User roles. The latter lets the private-push workflow read the recipient/message from Firestore and delete its one-time queue record. In this `announcement-host` repository, add its complete JSON as **Settings → Secrets and variables → Actions → New repository secret** named `FIREBASE_SERVICE_ACCOUNT`.
4. Add a repository Actions variable named `FIREBASE_PROJECT_ID` with the Firebase project ID. The service account and project ID must belong to the same Firebase project.
5. Ensure GitHub Actions are enabled. The `Send announcement push` workflow runs on changes to `announcement.json` on `main`; the one-click admin publishes through the GitHub API and triggers that workflow. Stopped or already-expired announcements send a cancellation message instead of a visible alert.
6. Users must install an APK built with this Firebase configuration, open it with internet access, and allow notifications. The app subscribes to the `announcements` topic and registers its device token after permission is granted.

The service-account credential remains in GitHub Actions and is never placed in the admin page or app. Android may defer delivery under battery restrictions, and a force-stopped app generally cannot receive messages until it is opened again.

## Enable private announcements

Private messages require Firebase Authentication (Anonymous and Email/Password providers) and Cloud Firestore. The admin writes directly to Firestore; restrictive Firestore rules allow this only for an account with the `announcementAdmin` custom claim. This avoids Cloud Functions and does not require upgrading the project to Blaze. Firestore still has usage limits on the free Spark plan; monitor Firebase usage and do not upgrade billing unless you choose to.

1. Register a Web app in the same Firebase project used by the Fintra Android app. Enable **Anonymous** and **Email/Password** in Authentication, and create the Firestore database.
2. In the Fintra app repository, copy `.env.example` to `.env.local` and fill in the Web app's API key, auth domain, project ID, and app ID. Rebuild and distribute the app so installations register their profile name. The API key is public Firebase client configuration; never put service-account keys in the app.
3. Configure `announcement-admin/firebase-config.js` with the same Web app settings. Create an Email/Password admin user in Firebase Authentication.
4. Deploy only the Firestore rules and index from this repository's root with the Firebase CLI: `firebase deploy --only firestore:rules,firestore:indexes`. The Firebase CLI project must be the same project as the app configuration. Do not deploy Cloud Functions.
5. Grant the admin role to that user's Firebase Auth UID using the Firebase Admin SDK with Application Default Credentials. Install the Google Cloud CLI if needed and run `gcloud auth application-default login`. In PowerShell, set `$env:GOOGLE_CLOUD_PROJECT = "fintra-notification"`. From `admin-tools/`, run `npm install` once, then `node set-admin-claim.js <uid> grant`. The signed-in Google account needs Firebase Authentication admin permissions on the project. Revoke admin access by passing `revoke` instead of `grant`. Never place service-account credentials in the dashboard or app.
6. Open the local announcement admin dashboard, choose **One user**, sign in, and select the recipient by profile name plus device-code suffix. The user must have opened Fintra online with Android notification permission enabled so the app can register its FCM token. When sending, the dashboard saves the private inbox message and a one-time push job to Firestore, then triggers the `Send private announcement push` workflow. The GitHub event contains only a random job ID; the workflow reads the message and device token from Firestore and sends a high-priority FCM data message directly to that installation. The Android app displays a heads-up notification and tapping it opens Fintra. The active-announcements panel also lets admins stop a public broadcast or permanently remove a private message from the recipient inbox; both actions require confirmation. Removing a private message prevents a queued push from being delivered but cannot retract a notification already delivered to the Android notification tray. The push workflow does not use Cloud Functions or require upgrading Firebase billing. Android notification settings, battery restrictions, network availability, and force-stopping can delay or prevent a heads-up banner; users can still see the message when Fintra next checks its inbox. Private content is never written to the public announcement JSON or sent through the global FCM topic.

Each installation has its own anonymous Firebase UID and device code; reinstalling or using another device creates another recipient. The dashboard can list at most 500 registered installations per request and shows up to 100 unexpired private messages in its active-announcements panel. A profile name is user-provided and is only a selection aid; the UID is the access-control boundary. Users can read and acknowledge only their own private inbox entries. Admin recipient lookup, active-message viewing, and message creation require a server-verified `announcementAdmin` custom claim checked by Firestore Security Rules.

The Firebase Web SDK configuration must be present in the app at build time. Deploy the updated Firestore rules after adding the `fcmToken` field, the admin-only `privateAnnouncementPushJobs` collection, and admin-only private-message deletion. The admin's fine-grained GitHub token needs **Contents: Read and write** permission on `announcement-host` to publish public notices and dispatch private-push workflows. The workflow service account also needs the roles and repository secret/variable listed above. Until the Firebase configuration, rules, admin claim, Actions secret, and project variable are in place, private inbox messages still appear when Fintra is opened, but outside-app push delivery is unavailable.

Run the sender tests with `node --test .github/scripts/send-announcement.test.mjs .github/scripts/send-private-announcement.test.mjs`.
