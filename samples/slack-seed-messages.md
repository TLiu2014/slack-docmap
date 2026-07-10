# Slack seed messages (test data for `/docmap`)

A ready-to-paste transcript for **one channel** — a stream of team messages,
some sharing a document link, some just chatter. Unlike placeholder data, **every
link here is real and publicly viewable**: click any of them and you'll see the
actual doc / repo. That makes it easy to sanity-check what `/docmap` extracted
against the real thing.

## How `/docmap` reads a channel

The pipeline runs Slack's `search.messages` with:

```text
in:<#CHANNEL> has:link after:YYYY-MM-DD
```

so it **only sees messages that contain a link** (`has:link`). The plain-text
messages below are included on purpose — they make the channel feel real — but
they won't themselves become doc nodes. The model reads each linked message's
text + URL to infer the doc type and its relationships to other docs.

Because you'll be posting from a single account, Slack will attribute every
message to *you*, and the extracted graph will show one contributor (you) sharing
all the docs. That's expected — the interesting part of the graph is the *docs
and how they reference each other*, not the people.

## The links (all real, all public)

| # | Link | Opens to |
| --- | --- | --- |
| 1 | Google Doc | Bazel design-doc template (world-readable) |
| 2 | Google Doc | Kubernetes SIG-Node weekly meeting notes |
| 3 | Google Doc | Kubernetes SIG-Docs meeting agenda |
| 4 | Google Doc | Kubernetes SIG-Scheduling notes |
| 5–10 | GitHub | `kubernetes/community`, `kubernetes/enhancements`, a repo file, `slackapi/bolt-js` (+ its README), `prisma/prisma` |

> These Google Docs are **live community documents** maintained by the Kubernetes
> project (and Bazel), shared "anyone with the link → viewer". Their contents
> change over time and their owners could change sharing at any point — but as of
> writing they open for anyone. If one ever asks you to sign in, swap in any other
> public doc/repo; the pipeline only cares about the message text + URL.

## How to use

1. Create (or pick) a channel, e.g. `#platform-guild`.
2. Invite the bot: `/invite @DocMap`.
3. **Post each line in the code block below as its own Slack message** (copy a line,
   paste, Enter). Keep one link per message — don't merge links into one message,
   or `has:link` will still match but the graph collapses them.
4. Wait ~10–30s for Slack to index the messages, then run `/docmap` and pick
   `#platform-guild` (see `LOCAL_DEV.md` → Path B).

---

## Channel: `#platform-guild`

A platform team that (a) contributes to a couple of Kubernetes SIGs and (b) is
building an internal Slack bot. Good mix of doc *types* (design doc, meeting
notes, specs, source repos) and cross-references for "references / responded-to"
edges.

```text
Morning all — kicking off the platform revamp this sprint. Standup at 10, async notes as usual. No links, just vibes ☕
Let's write our proposal against a real template so it's consistent. Using this design-doc template as the base: https://docs.google.com/document/d/1cE5zrjrR40RXNg64XtRFewSv6FrLV6slGkkqxBumS1w/edit
The spec/KEP format we should mirror lives here — pairs well with the design-doc template above: https://github.com/kubernetes/enhancements
Will start on the dashboard once the API shape is settled. Flagging I'm blocked on the schema — no link yet.
Runtime decisions from this week's node sync are captured here, relevant to our rollout plan: https://docs.google.com/document/d/1Ne57gvidMEWXR70OxxnRkYquAoMpt56o75oZtg-OeBg/edit
Adding our onboarding item to the docs working-group agenda: https://docs.google.com/document/d/1emuO4nmaQq3K8JZ9-MQeIygtrCPO9kWv7U7RzTaW4F8/edit
For the Slack bot itself we're building on Bolt — repo here: https://github.com/slackapi/bolt-js
Setup steps for the dashboard integration are covered in the Bolt README (also touches the schema question above): https://github.com/slackapi/bolt-js/blob/main/README.md
Governance + every SIG's README is in the community repo if you need owners/cadence: https://github.com/kubernetes/community
Specifically the node SIG's meeting cadence + owners are here (pulled from the community repo above): https://github.com/kubernetes/community/blob/master/sig-node/README.md
Reminder to drop async standup updates in the thread before 10 🙏 no doc needed
Scheduling SIG notes for reference — relevant to how we batch our jobs: https://docs.google.com/document/d/13mwye7nvrmV11q9_Eg77z-1w3X7Q1GTbslpml4J7F3A/edit
Datastore for the bot will be Prisma-backed, going with https://github.com/prisma/prisma
Heads up, brief blip on the staging cluster around 2pm, rolling a node back. Text only, no link.
Nice work everyone — RFC draft goes out Friday, will link it here for review.
```

---

## What a good result looks like

After running `/docmap` over `#platform-guild` you should get a graph with roughly:

- **Docs (~10):** a Google Doc design-doc template, three Google Doc meeting-notes/
  agenda docs, and six GitHub links (two source repos, a repo file, the Bolt repo
  + its README, and the Prisma repo) — typed as `gdoc` and `github`.
- **Users:** just you — Slack attributes every message in this seed to whoever
  posts it. The value of the graph is in the *doc-to-doc* relationships, not the
  contributor count.
- **Edges:** e.g. *you → shared → design-doc template*, *KEP specs → references →
  design-doc template*, *SIG-Node README → references → community repo*,
  *Prisma repo → related-to → the Slack bot work*.

The exact shape varies by model and run — the pipeline intentionally omits
relationships it isn't confident about.
