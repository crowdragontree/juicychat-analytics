# JuicyChat Analytics Tool v1.0.0

**Dashboard, Your Performance, JuicyChat Analysis, Engine Library and Settings in one Windows/Linux desktop app.** Taken from Juicy Blueprint Studio 1.6.0's analytics, with no bot building.

## What's included

### Dashboard
- Activity heatmap, Discovery by placement, Best tags on your bots and the current signals (engines gaining and losing ground).

### Your Performance
- One account, read straight from the account you sign in with in Settings: your public bots, their chats, likes and favourites, growth over time, what's working by series and by tag, Discovery by Placement, the Discover tab, and each bot's forensics.

### JuicyChat Analysis
- When to release (Activity heatmap and Best times by tag) and the research set: collect Recent + Trending, then measure the success engines on your computer.

### Engine Library
- The measured success engines, with the bots behind each one.

### Settings
- JuicyChat sign-in with a magic link, the automatic daily pulls (their times and time zone), JuicyChat Collection and Blocked tags (bots with a blocked tag are not pulled).

### The JuicyChat scanner
- Collecting, pulling and signing in use the same scanner as Blueprint Studio (Python, Playwright and Chromium). The app installs it once on this computer the first time (Settings > Install scanner) into its shared folder, which app updates never replace.

### With the JuicyChat Creator Tool
- When this app is installed, the JuicyChat Creator Tool (v1.5.1 and later) shows an Analytics tab that runs this app's own code, so this app's updates show there automatically. The Creator Tool keeps its own sign-in and data. The two apps never pull from JuicyChat at the same time: one waits until the other is done.

## Building Windows / Linux releases

1. Upload this **extracted source folder's contents** to the `crowdragontree/juicychat-analytics` GitHub repository, including `.github`.
2. Select **Actions → Build JuicyChat Analytics Tool (Windows and Linux)**.
3. Both the Windows and Linux jobs must pass all required tests (source tests, every tab in the packaged app, and the automatic update).
4. Download the generated artifacts. Extract the outer GitHub artifact ZIP and obtain `JuicyChat-Analytics-Windows-x64.zip` and `JuicyChat-Analytics-Linux-x64.zip`.
5. Publish a **v1.0.0** release with those two inner ZIPs as release assets, using their existing filenames, and `RELEASE_NOTES_v1.0.0.md` as the release notes.

The program is `JuicyChat Analytics Tool.exe` (Windows) / `JuicyChat Analytics Tool` (Linux). **Check for updates → Update & Restart** installs newer releases from this repository. Do not rename the release asset ZIPs.

## Local source use

From this source folder, run `npm install` and `npm start` with Node.js 22.12+ installed. The published Windows/Linux ZIPs do **not** require Node or npm.
