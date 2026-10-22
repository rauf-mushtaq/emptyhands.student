# EmptyHands student app

The app for EmptyHands KaraTe School students: an account, the year's dojo calendar with the dates that matter to them, a countdown to the next class, and notices from their coaches.

**Live at <https://rauf-mushtaq.github.io/emptyhands.student/>**. The coaches' side is [emptyhands.control.panel](https://github.com/rauf-mushtaq/emptyhands.control.panel), whose README covers the Firebase setup. Both use the same Firebase project.

## What students get

- **Sign up** with the student's name (and a parent/guardian for juniors), classes, dojo and karate grade.
- **Home**: next class with a countdown, a warning if the dojo is closed before then, upcoming key dates and the latest notices.
- **Calendar**: the full year in the printed calendar's colours (training, closed, black-belt classes, gradings), filtered to what's relevant to them. Tap a date for details, or add the dates to their phone's calendar.
- **Join request**: a new account waits until a coach accepts it in the coach panel. Until then the calendar and key dates still work.
- **EmptyHands chats** (once accepted), with four channels: **Notices** (only Sensei can post), **Group chat** (everyone), **Training journal** (students share what they practised) and **Message Sensei** (private). Sensei's posts show in bold. A **Recommended channel** card links to the Shotokan Karate Academy YouTube channel; set its address in `js/config.js` (`RECOMMENDED`).
- **Homework** set by Sensei, for everyone, a group or one student. Students tick it off; Sensei sees who has.
- **Syllabus**: the 10th Kyu to Shodan summary sheet (`assets/syllabus/`, rendered from `assets/docs/EmptyHands-Syllabus.pdf`).
- **Key dates & days off** listed under the calendar: closures, gradings, black-belt classes and any notes.
- **Profile**: edit details, sign out or delete the account.

## Files

| | |
| --- | --- |
| `index.html`, `js/student.js` | The app |
| `privacy.html` | Privacy policy (needed for the app stores) |
| `js/config.js` | Firebase config and coach emails. **Keep it the same as in emptyhands.control.panel.** |
| `js/common.js`, `js/backend.js`, `js/calendar-data.js`, `app.css` | Shared with the coach panel. Copy any changes across. |
| `mobile/` | The App Store and Google Play apps. See [`mobile/README.md`](mobile/README.md). |

## Turn on the website

**Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save.** Until Firebase is set up (see the coach panel README), the app runs in demo mode and saves everything only in the browser you're using.

To try it on your computer: `python3 -m http.server 8000` in this folder, then open <http://localhost:8000>.
