# Fintra Announcement Host

This folder contains the public `announcement.json` file read by Fintra. GitHub Pages serves the JSON, and a GitHub Actions workflow sends Android push notifications after the file changes.

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
3. Create a Google service account with the Firebase Cloud Messaging API Admin role. In this `announcement-host` repository, add its complete JSON as **Settings → Secrets and variables → Actions → New repository secret** named `FIREBASE_SERVICE_ACCOUNT`.
4. Add a repository Actions variable named `FIREBASE_PROJECT_ID` with the Firebase project ID. The service account and project ID must belong to the same Firebase project.
5. Ensure GitHub Actions are enabled. The `Send announcement push` workflow runs on changes to `announcement.json` on `main`; the one-click admin publishes through the GitHub API and triggers that workflow. Stopped or already-expired announcements send a cancellation message instead of a visible alert.
6. Users must install an APK built with this Firebase configuration, open it with internet access, and allow notifications. The app subscribes to the `announcements` topic after permission is granted.

The service-account credential remains in GitHub Actions and is never placed in the admin page or app. Android may defer delivery under battery restrictions, and a force-stopped app generally cannot receive messages until it is opened again.

Run the sender tests with `node --test .github/scripts/send-announcement.test.mjs`.
