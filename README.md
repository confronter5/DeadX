# 💀 DEADPOOL-X 2026

Clean • Fast • No crash bullshit  
Made by **Confronter**

## Features
- ✅ Anti Delete
- ✅ Anti Edit  
- ✅ Anti ViewOnce (command `.vv`)
- ✅ Auto React on status + messages (different random emojis)
- ✅ Auto View Status
- ✅ Fast Music Download (`play`, `ytmp3`, `ytmp4`) – no waiting bullshit
- ✅ Speed optimized
- ✅ Base64 / SESSION_ID support
- ✅ Public / Self mode

## Deploy

### Heroku
1. Fork this repo
2. Create new Heroku app
3. Connect GitHub
4. Add buildpacks:
   - `heroku/nodejs`
   - `https://github.com/jonathanong/heroku-buildpack-ffmpeg-latest`
5. Deploy
6. Go to **Settings → Config Vars**
7. Paste your full `deadpool~...` session into SESSION_ID
8. Or leave empty and scan QR from the logs

### Termux / VPS
```bash
git clone <your-repo>
cd Deadpool-X
npm install
node index.js
```

## Commands
| Command | Description |
|---------|-------------|
| `.menu` | Show menu |
| `.ping` | Speed test |
| `.runtime` | Uptime |
| `.play <name>` | Download song fast |
| `.ytmp3 <url>` | YouTube to MP3 |
| `.ytmp4 <url>` | YouTube to MP4 |
| `.vv` | Open view once |
| `.public` / `.self` | Mode switch (owner only) |

## Owner
Confronter  
wa.me/254796283064

**2026**
