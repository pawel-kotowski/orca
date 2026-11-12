---
name: orca-move-to-inbox
description: Move your card into the user's Orca Inbox so they see it. Use when you need their
  decision or input, when the work they asked for is done but something you started keeps running
  (a server, a watcher, workers, subagents), or when something happened they would want to know
  now. Not for routine progress. Run `orca move-to-inbox --message "<one line>"`.
user-invocable: false
---

# Move your card to the user's Inbox

Orca lists every agent as a card. Cards that need the user sit in their Inbox; cards of agents
that are still busy sit under Working, out of the way.

Your card goes to the Inbox on its own when you ask a question, wait for an approval, or finish
with nothing left running. While anything you started keeps running (a dev server, a watcher,
workers, subagents, a background shell), it stays under Working however many turns you end, and
the user is not told. When they should look at you now, move it yourself:

```sh
orca move-to-inbox --message "Lots 1-4 merged; the deploy is live and the dashboard is up"
```

- The message is one line, under 200 characters, saying what they would act on. It is the card's
  text in the Inbox.
- It always moves the card, even if the user is looking at you right now. The card stays in the
  Inbox until they clear it.
- Use it when: the work they asked for is done but something you started still runs; you need a
  decision only they can make; something failed or happened that they asked to hear about or would
  want to know now.
- Not for routine progress, and not instead of asking: a question still goes through your normal
  way of asking the user.
- It works only in a terminal Orca started for you. If it fails, say so in your reply and carry on.
