# Nitro Deal Rooms

One site, many deal rooms. Each customer gets a private link with their proposal, a shared
Mutual Action Plan (built from Nitro's process: Discover & Demo → Pilot → Executive Briefing → Commit & Rollout),
the Nitro team, documents and a one-page brief. Changes either side makes to the plan save for everyone.

## For sales reps

1. Go to **your-site.netlify.app/admin** and sign in with the team's admin code.
2. Click **New deal room**, fill in the account, key dates, contacts, Nitro team and pricing, then click **Create deal room**.
3. Copy the private link and send it to your customer contacts.

The admin page lists every deal room with its plan progress, the last change, and any
"Approve scope" or "I have a few questions" clicks. Use **Edit** to change details.
Tick **Rebuild the plan from these dates** only if you want to replace the plan steps.

## How it's built

| File | What it is |
| --- | --- |
| `index.html` | The deal room customers see (`/r/<private-id>`) |
| `admin.html` | The Nitro-only setup page (`/admin`) |
| `netlify/functions/room.mjs` | Loads a deal room and saves plan changes |
| `netlify/functions/admin.mjs` | Creates, edits and lists deal rooms (needs the admin code) |
| `netlify/lib/template.mjs` | Nitro's standard plan steps and default content |

Data is stored in Netlify Blobs (store `dealroom`). The admin code is set on the first visit
to `/admin` and stored only as a salted hash. Deal room links are long and random, so only
people you send a link to can open that room.
