const fs = require('fs')
const chalk = require('chalk')

// ==================== DEADPOOL X CONFIG 2026 ==================== //
global.owner = ['254796283064'] // your number motherfucker
global.ownername = 'Confronter'
global.botname = 'DEADPOOL-X'
global.packname = 'DEADPOOL-X'
global.author = 'CONFRONTER 2026'
global.prefa = ['', '!', '.', '#', '/']
global.sessionName = 'session'
global.sp = '•'

global.gr = 'https://chat.whatsapp.com/FqvQzWARlwc7XlerabWq7z'
global.ig = 'confronter._'
global.email = 'confrontermfisa@gmail.com'
global.region = 'Kenya'

// Features
global.autoviewstatus = process.env.AUTO_VIEW_STATUS || 'true'
global.autolike = process.env.AUTO_LIKE_STATUS || 'true'
global.autoreact = process.env.AUTO_REACT || 'true'
global.anticall = process.env.ANTICALL || 'false'
global.antidelete = process.env.ANTI_DELETE || 'true'
global.antiedit = process.env.ANTI_EDIT || 'true'
global.antiviewonce = process.env.ANTI_VIEWONCE || 'true'
global.public = true

global.menutype = 'v2'

global.limitawal = {
    premium: 'Infinity',
    free: 30
}

// React emojis - different ones for variety
global.reactEmojis = ['🔥', '💀', '😂', '❤️', '👀', '🚀', '⚡', '🎯', '😈', '🦾', '📌', '💥']

let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.redBright(`Updated ${__filename}`))
    delete require.cache[file]
    require(file)
})
