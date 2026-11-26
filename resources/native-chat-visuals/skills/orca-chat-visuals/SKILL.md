---
name: orca-chat-visuals
description: Show a chart, diagram, table, report or mockup inline in this Orca chat as an HTML
  page. Use when a visual would help the user understand your answer. Only available when the
  ORCA_CHAT_SCRATCH_DIR environment variable is set.
user-invocable: false
---

# Inline visuals in an Orca chat

Orca can show an HTML page inside your reply. Use one whenever a visual would make the answer
clearer.

## Writing the page

- Save it in the folder named by `ORCA_CHAT_SCRATCH_DIR` (`printenv ORCA_CHAT_SCRATCH_DIR`; in
  PowerShell `$env:ORCA_CHAT_SCRATCH_DIR`). If it's unset or you can't write there, skip the visual.
  This folder belongs to this chat and is kept as long as the chat. Save files meant for the
  project in the workspace.
- One complete HTML file per visual, directly in that folder, under 512 KB, with a new file name
  each time (e.g. `latency-by-region-7c1e.html`): letters, digits, `.`, `_`, `-`, ending in `.html`.
- Inline your styles, scripts and data. Libraries and fonts may load only from cdn.jsdelivr.net,
  unpkg.com, cdnjs.cloudflare.com, esm.sh, fonts.googleapis.com and fonts.gstatic.com. The page
  can't make network requests; use inline SVG or `data:` URLs for images.
- `<audio>` and `<video>` elements can't load media here, even from `data:` URLs. To share a
  recording, save it as its own file in the `ORCA_CHAT_SCRATCH_DIR` folder (in the workspace only
  if the user wants it in the project) and give its path in your reply instead.
- Don't size anything to the viewport height (`100vh`); Orca fits the frame to your content.
- Use Orca's theme variables for surfaces, text, and controls; pair hover `--accent` with
  `--accent-foreground`. Scope fixed-palette CSS to its mockup. Orca updates tokens and
  `color-scheme` live. Charts use `--chart-1` to `--chart-5`.
- Make the saved HTML readable in an ordinary browser too: use paired fallback values such as
  `background:var(--background,#fff);color:var(--foreground,#171717)` for every theme-token use.
  Scripts reading chart colors need a fallback too: `getComputedStyle(document.documentElement)
  .getPropertyValue('--chart-1').trim() || '#2563eb'`. Never redefine Orca's tokens on `:root`:
  those declarations would override the viewer's live theme. Use separate names for local colors.
- Exposed tokens: `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`,
  `--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`,
  `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`,
  `--destructive`, `--destructive-foreground`, `--border`, `--input`, `--ring`, `--radius`,
  `--font-sans`, `--font-mono`, and `--chart-1` through `--chart-5`.

## Pointing at code

Give any element `data-orca-show="path/to/file.ts:40-62"` (or `file.ts:40` for one line) and a
click on it opens that file beside the chat with those lines highlighted. Use it on the boxes of
an architecture diagram, the rows of a table or the steps of a flow, so the reader can go from
the picture to the code behind it. The path is relative to the workspace root, never absolute
and never with `..`; ranges are at most 5000 lines. Such elements get a pointer cursor; add your
own hover style if you like.

In the reply itself, a link or path such as `src/app.ts:40-62` opens with the whole range
highlighted, not just its first line.

## Showing it

After the file exists, put this on its own line in your reply, outside any code block:

::orca-visual{file="latency-by-region-7c1e.html" title="Latency by region"}

`file` is the bare file name, never a path; `title` is optional. At most 8 per reply.

## Pop-out and the user's comments

The user can open a visual in an Orca tab of its own beside the chat (its Open button), where it
stays while the chat moves on, its code links still work, and it updates by itself when you
rewrite the file. In the tab Orca frames the page as a document (padding around it, a centred
column up to 1080px wide, the editor's background), so let the page flow to its width rather
than fixing one. There they can comment on any part of the page (a pin on the part, a thread
beside it); comments are Orca notes of the workspace, kept until resolved or cleared.

When they press **Send to chat**, the comments arrive as their message: each names the visual's
path, the part (a CSS selector, the code it shows, the text it holds) and a note id. You can also
read them any time:

```sh
orca notes list                      # every open note: code lines, diffs and visual parts
orca notes list --file flow-7c1e.html --json
```

Answer either way, as fits:

- **In chat**: a normal reply, naming the parts you mean.
- **On the visual**: `orca notes reply <note id> --body "<answer>"` puts your answer on that
  note's thread in the open tab at once; `orca notes resolve <note id>` marks it done. Rewrite the
  HTML file under the same name to change the page: the tab reloads it and keeps the comments,
  re-pinned on the same parts (keep an element's `id`, text or `data-orca-show` so a note finds
  its part again).
