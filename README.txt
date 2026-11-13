VENTUREX PICKER - VERCEL
========================
index.html, style.css, app.js  = the website
api/portal.js                  = tiny server function (login, live counts, max 15 per track)
api/_teams.js                  = the 54 team access codes (kept on the server, not visible to teams)

DEPLOY (about 5 minutes)
1. github.com -> New repository -> "uploading an existing file" -> drag ALL files and the api folder in -> Commit.
2. vercel.com -> Add New -> Project -> Import that repo -> Deploy. (No settings to change.)
3. In the Vercel project: Storage -> Create Database -> "Upstash for Redis" (free) -> Create -> Connect to this project.
4. Deployments -> ... on the latest -> Redeploy. (So the function picks up the storage keys.)
5. Open your-site.vercel.app, log in with a code, done.

CHANGE THE CAP OR TRACK TEXT: edit CAP / PROBLEMS at the top of api/portal.js, commit, Vercel redeploys.

SEE / RESET PICKS: Vercel -> Storage -> your Upstash database -> Open in Upstash -> Data Browser.
  vx:choices = each team's pick, vx:counts = teams per track.
  To wipe test picks before the event, delete both keys.
