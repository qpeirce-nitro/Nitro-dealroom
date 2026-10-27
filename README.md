# Nitro Deal Room — Kestrel Health

A standalone digital sales room: Proposal, Mutual Action Plan, Our Team, Documents and In Brief.
Changes to the Mutual Action Plan, made by Nitro or by Kestrel, are saved on the site and
shown to everyone who opens it. Open pages pick up others' changes about every 8 seconds.

## What's in the folder

| File | What it is |
| --- | --- |
| `index.html` | The whole site (all five pages) |
| `seed.json` | The starting plan. It's loaded only the first time the site runs; after that the live plan is stored on Netlify. |
| `netlify/functions/plan.mjs` | The small server that saves the plan (Netlify Functions + Netlify Blobs) |
| `netlify.toml`, `package.json` | Netlify settings |

## Deploy (about 5 minutes)

The saving needs Netlify Functions, so deploy with the Netlify CLI or from a Git repo.
Dragging the folder into Netlify Drop also works, but then the plan saves in each person's
browser only.

**Option A, Netlify CLI**

```bash
cd nitro-dealroom
npm install
npx netlify-cli login
npx netlify-cli deploy --prod     # choose "Create & configure a new site" the first time
```

**Option B, Git**: push this folder to a GitHub repo, then in Netlify choose
*Add new site → Import an existing project*. There's no build command; the publish directory is `.`.

## Lock it with an access code (recommended)

Anyone who has the link can edit the plan unless you set a code. In Netlify, go to
*Site configuration → Environment variables* and add:

- `ROOM_CODE`: the code you give Kestrel and your team. Each person enters it once per browser.
- `ADMIN_CODE` (optional): lets you read who clicked "Approve scope" or "I have a few questions":

```bash
curl -H "x-room-code: $ROOM_CODE" -H "x-admin-code: $ADMIN_CODE" https://YOUR-SITE.netlify.app/api/plan?requests=1
```

Redeploy after changing environment variables.

## Before you send it

Replace the placeholders in `index.html`: pricing (`[$ ANNUAL TOTAL]`, `[$ PER SEAT]`, `[PRICE LOCK]`),
`QUOTED_PRICE` (the calculator's price per seat), the welcome video, the document links, and the sample
names and email address. Kestrel Health and its people are sample content.

To start a different deal, edit `seed.json` **before** the first deploy. Once the site has run,
the live plan lives in Netlify Blobs (store `dealroom`), and changes are made on the page itself.
