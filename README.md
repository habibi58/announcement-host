# Fintra Announcement Host

This folder contains the public `announcement.json` file read by Fintra. It is a small static site with no server, dependencies, or secrets.

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
