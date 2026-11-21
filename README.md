# Study desk — flashcards

A spaced-repetition flashcard app that installs on an Android phone.

Everything runs on the device. No account, no API key, no network calls, no cost.
Your decks live in the browser's own storage on that device.

## Study methods

Choose Flip the card, Multiple choice, Type the answer, True or false,
or Matching pairs. Flip the card lets you recall mentally, reveal the
answer, then select **I remembered it** or **I missed it**. Revealing alone does not
record a result. The scheduler chooses the next review date using that self-check.
True/false and multiple choice need enough distinct answers to create clear distractors.
Matching needs at least two selected cards. Questions and answers can be reversed.

In Add or Cards → edit, choose marking rules for each question: case sensitivity,
diacritic differences, punctuation differences, small spelling mistakes, and extra spaces. You can also supply
alternative accepted answers, one per line. Alternatives apply to full-answer recall;
reverse questions use the saved question text.
Bulk additions use the marking settings shown above the bulk form.
Each card can also include an optional explanation, example or memory aid. It is shown
after answering, never as a hint during the final test. Explanations survive text exports,
library backups and review-history resets.

Marking compares text locally, using the selected rules. It does not interpret an
answer's meaning. Small spelling tolerance keeps numbers, numerical signs, mathematical
operators and negation distinct. Each exercise displays its question's active rules.
Diacritics are required by default even when spelling tolerance is enabled. Enable
**Allow diacritic differences** to accept `cafe` for `café`, `nino` for `niño`, etc.

## Automatic review plan

There are no Again, Hard, Good or Easy ratings. Every checked answer saves its result
and next review date immediately, even if you then leave the session.

- The overall plan covers the entire deck. Manual mode also lets you focus on
  scheduled reviews, starred cards, or cards that need lots of practice.
- A new correct answer is due tomorrow. Correct recall on later due days increases
  the interval using the card's strength, difficulty, missed reviews and study method.
  Hints and recognition provide less evidence than unaided recall.
- A miss is due tomorrow, reduces the card's strength and increases its difficulty.
  Recall sessions insert up to two extra attempts with other cards between them where
  possible. Matching records each question's first pairing attempt, then lets you finish
  the board without repeatedly changing its schedule.
- Same-day retries and early successful practice do not extend the review date.
  A correction after a miss stays due tomorrow. Intervals are capped at 365 days,
  and the most recent 60 attempts per card are kept in library backups.

The scheduler is an adaptive local algorithm, not a prediction of whether you will
remember a particular fact. Existing cards keep their saved due dates and gain the
new scheduling fields as you review them. Resetting review history also resets those fields.

## Picking up your work

Recall sessions save their place automatically. Use **Pause**, or return after a refresh,
then choose **Resume session** in the deck. Checked answers and final-test mistakes remain
recorded; resuming does not count them twice. **End** discards the unfinished session while
keeping answers already checked. Starting a new session replaces the previous saved one.
Saved sessions expire after 14 days and are invalidated when their cards or coach settings
change. Matching pairs save results as you go, but a matching board itself is not resumed.
Unsubmitted text in an answer field is not saved.

On the library shelf, search decks by name or topic and sort by name or cards due.
Card and deck deletion each offer an **Undo** button for the latest deletion while
that screen remains open. Undo restores the saved card contents and review history.

## Optional study coach

Each deck has a **Use study coach for this deck** switch in Review. It is off by default
so existing decks retain manual method selection. When enabled, the coach recommends
guided sessions rotating through Flip the card, Multiple choice, Type the answer,
Matching pairs and True or false. Cards needing practice appear first. Unsupported
methods are skipped: multiple choice needs four distinct answers, true/false needs
two distinct answers and matching needs two cards. A card-by-card overall plan shows
each estimate, next review date and recommended method.

Set an optional learning deadline. The coach shows the remaining days and an unfinished
card target, and prevents coached review dates extending past a future deadline.
An overdue deadline does not lock you out of learning.

Progress levels are **New**, **Needs lots of practice**, **Learning**, **Young** and
**Mature**. They are calculated from recent accuracy, unaided recall across separate sessions,
memory strength and overdue reviews, rather than just interval lengths. Perfect scores
in recognition exercises alone do not make a card mature. When every card is mature,
the coach offers a final test.

Mastery now needs roughly three times the independent practice: at least nine successful
sessions per card, including at least three unaided recall sessions, before a card becomes
mature. Accuracy, memory strength, missed attempts and overdue decay still affect its score.
Progress from recognition methods is supported by unaided recall, so repeatedly guessing
multiple-choice or true/false answers cannot master a card on its own. Twelve perfect
independent sessions can earn full practice credit; memory strength and mistakes also matter.
Sessions can all take place on the same day: there is no day-based mastery ceiling.
Retries inside one session count as one source of evidence, and a failed session does
not erase successful sessions from earlier that day. Scores recalculate from saved history.
Completing a guided session advances and saves the rotation, including matching boards.

The final test asks every question once using unaided typed answers and each question's
marking rules. No hints, same-test retries or answer feedback are given until it ends.
Only a complete test with 100% correct passes the deck. Interrupted tests cannot pass;
failed tests send missed questions back to practice. After passing, one complete revision
session per day is offered until the optional deadline, inclusive. Without a deadline,
daily revision continues. These prompts appear when you open the deck; the app does
not send background notifications. After any completed final test, **Continue guided practice**
lets you keep using the coach, including after daily revision is complete or the deadline
has passed. Optional practice preserves your test result and daily revision status.

Changing a question, answer or marking rules resets that card's learning evidence and
invalidates a previous deck pass. Resetting review history also clears the final-test
and daily-revision status and restarts the guide rotation. Library backups preserve coach settings and progress.

## Files

- `index.html` — the whole app. React and the styles are already inside it, so it works on its own.
- `manifest.webmanifest`, `icon-192.png`, `icon-512.png` — what makes Android offer "Install app".
- `sw.js` — caches the app so it opens with no signal.

## Try it right now

Open `index.html` in any browser. That's it. (Install and offline caching need the files
to be served over http/https, so those two bits stay quiet when opened as a plain file.)

## Put it on your phone

1. Make a free GitHub account and a new public repository.
2. Upload all five files to the top level of it.
3. Settings → Pages → Source: "Deploy from a branch", branch `main`, folder `/ (root)`. Save.
4. Wait a minute, then open the address it gives you (`https://yourname.github.io/reponame/`) in Chrome on your phone.
5. Chrome menu → "Add to Home screen" / "Install app". It then opens full screen with no browser bars and works offline.

Netlify Drop (drag the folder onto netlify.com/drop) does the same thing without a repository.

For Netlify builds, use `npm run build` and publish `dist`. The included `netlify.toml`
sets both values when this project folder is the repository root or Netlify base directory.
If the repository contains the whole workspace, set the base directory to `Study Desk`.
The build creates `dist/index.html`, the service worker, manifest and app icons. For
Netlify Drop, run the build locally and drag the generated `dist` folder onto Netlify.

## Changing it later

The main source is `app.jsx`. `review.jsx` contains the study methods, `study-engine.js`
handles marking and scheduling, and `marking-settings.jsx` supplies the question settings.
`coach-engine.js` and `coach.jsx` provide the coach, `progress.jsx` shows mastery, and
`card-format.js` reads and writes the extended text format.
`session-store.js` manages paused sessions and recovery after an interrupted save.
`enhancements.css` adds responsive sizing and accessible controls.
`index.html` still contains the bundled app and styles, so it opens without a build server.
To rebuild after editing (use `npm.cmd` in PowerShell if script execution is disabled):

```
npm ci
npm run build
npm test
```

The build replaces the app script and enhancement styles inside `index.html` automatically.
It also writes a deployment copy and all required static assets into `dist/`.
The existing embedded utility CSS is retained. The build automatically derives the offline
cache version from the app, service worker and cached assets; no manual version bump is needed.
Tests cover the scheduler and marking rules, every study method in the bundled app,
question settings, coach recommendations, final tests, daily revision, deadline handling,
export/import and backup restoration, plus NiceOut's daily rain percentages,
suggestions, unit conversion, request races and offline cache handling. Audit tests also cover
mathematical marking, practice evidence, date validation, interrupted sessions, deletion undo,
matching solvability, explanations and CSV imports. They use a simulated DOM;
phone layout, real geolocation and installation still need a browser check.
NiceOut integration checks run only when the sibling NiceOut checkout is present;
StudyDesk's own tests run independently when this repository is cloned on its own.

## Moving your cards between devices

Storage is per-device, so a deck made on the laptop won't appear on the phone.
Use **Download library backup** on the deck shelf to save every deck, topic tag and
review schedule as JSON. Choose **Restore backup** on the other device and select that
file. Restore validates the file and asks before replacing the existing library.
Download a backup of any existing library first if you want to keep it.

A deck's Import / export tab copies question/answer lines including marking rules,
alternative accepted answers and tags:

```text
French for coffee? | café |(caseSensitive=false;ignoreDiacritics=true;ignorePunctuation=true;allowTypos=false;ignoreExtraSpaces=true;acceptedAnswers=[];tags=["French"])
```

**Download deck text** saves the shareable format as a file. **Choose text file** loads
TXT, CSV or TSV cards into an import preview; the app shows parsing errors and the number
of cards before you add them. CSV quoted fields, embedded commas and doubled quotes are supported.

Simple `question | answer` lines remain supported. Text containing a pipe, quote or
newline is JSON-quoted by the exporter. Invalid imports report the line number and
leave the deck unchanged. Text export does not include coach settings, deadlines,
final-test results or review history; use a library backup for those.

## Render deployment

Create a Static Site using this repository, with a blank Root Directory, build command
`npm install && npm run build` and Publish Directory `dist`. `npm build` is not a valid
command. The included `render.yaml` supplies these settings for Blueprint deployments.
If an existing site was created manually, update its Build Command in the Render dashboard;
adding a Blueprint file does not replace a manually configured command automatically.
