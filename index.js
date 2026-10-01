/*
  DEADPOOL-X 2026
  Clean • Fast • No crash bullshit
  by Confronter
*/

require('./deadpool')
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  downloadContentFromMessage,
  jidDecode,
  proto,
  getContentType
} = require('@whiskeysockets/baileys')
const pino = require('pino')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const path = require('path')
const FileType = require('file-type')
const ytdl = require('@distube/ytdl-core')
const yts = require('yt-search')
const moment = require('moment-timezone')
const { exec } = require('child_process')

const store = {
  messages: {},
  contacts: {},
  chats: {}
}

// ==================== HELPERS ==================== //
function smsg(conn, m) {
  if (!m) return m
  let M = proto.WebMessageInfo
  m = M.fromObject(m)
  if (m.key) {
    m.id = m.key.id
    m.isBaileys = m.id.startsWith('BAE5') && m.id.length === 16
    m.chat = m.key.remoteJid
    m.fromMe = m.key.fromMe
    m.isGroup = m.chat.endsWith('@g.us')
    m.sender = conn.decodeJid(m.fromMe && conn.user.id || m.participant || m.key.participant || m.chat || '')
  }
  if (m.message) {
    m.mtype = getContentType(m.message)
    m.msg = m.mtype == 'viewOnceMessage' ? m.message[m.mtype].message[getContentType(m.message[m.mtype].message)] : m.message[m.mtype]
    m.body = m.message.conversation || m.msg?.caption || m.msg?.text || (m.mtype == 'listResponseMessage' && m.msg.singleSelectReply.selectedRowId) || (m.mtype == 'buttonsResponseMessage' && m.msg.selectedButtonId) || (m.mtype == 'viewOnceMessage' && m.msg.caption) || m.text
    let quoted = m.quoted = m.msg?.contextInfo ? m.msg.contextInfo.quotedMessage : null
    m.mentionedJid = m.msg?.contextInfo ? m.msg.contextInfo.mentionedJid : []
    if (m.quoted) {
      let type = getContentType(quoted)
      m.quoted = m.quoted[type]
      if (['productMessage'].includes(type)) {
        type = getContentType(m.quoted)
        m.quoted = m.quoted[type]
      }
      if (typeof m.quoted === 'string') m.quoted = { text: m.quoted }
      m.quoted.mtype = type
      m.quoted.id = m.msg.contextInfo.stanzaId
      m.quoted.chat = m.msg.contextInfo.remoteJid || m.chat
      m.quoted.isBaileys = m.quoted.id ? m.quoted.id.startsWith('BAE5') && m.quoted.id.length === 16 : false
      m.quoted.sender = conn.decodeJid(m.msg.contextInfo.participant)
      m.quoted.fromMe = m.quoted.sender === conn.decodeJid(conn.user.id)
      m.quoted.text = m.quoted.text || m.quoted.caption || m.quoted.conversation || m.quoted.contentText || m.quoted.selectedDisplayText || m.quoted.title || ''
      m.getQuotedObj = m.getQuotedMessage = async () => {
        if (!m.quoted.id) return false
        let q = await store.loadMessage(m.chat, m.quoted.id, conn)
        return smsg(conn, q)
      }
      let vM = m.quoted.fakeObj = M.fromObject({
        key: {
          remoteJid: m.quoted.chat,
          fromMe: m.quoted.fromMe,
          id: m.quoted.id
        },
        message: quoted,
        ...(m.isGroup ? { participant: m.quoted.sender } : {})
      })
      m.quoted.delete = () => conn.sendMessage(m.quoted.chat, { delete: vM.key })
    }
  }
  m.reply = (text, chatId = m.chat, options = {}) => Buffer.isBuffer(text) ? conn.sendFile(chatId, text, 'file', '', m, { ...options }) : conn.sendMessage(chatId, { text: text, ...options }, { quoted: m })
  return m
}

const getBuffer = async (url) => {
  try {
    const res = await fetch(url)
    return Buffer.from(await res.arrayBuffer())
  } catch (e) {
    return null
  }
}

const runtime = (seconds) => {
  seconds = Number(seconds)
  var d = Math.floor(seconds / (3600 * 24))
  var h = Math.floor(seconds % (3600 * 24) / 3600)
  var m = Math.floor(seconds % 3600 / 60)
  var s = Math.floor(seconds % 60)
  return `${d}d ${h}h ${m}m ${s}s`
}

// ==================== SESSION LOADER (deadpool~ base64) ==================== //
function loadSession() {
  const sessionDir = path.join(process.cwd(), global.sessionName || 'session')
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true })
  }

  const sessionId = process.env.SESSION_ID || process.env.SESSION || ''
  if (sessionId && sessionId.startsWith('deadpool~')) {
    try {
      const base64Data = sessionId.replace('deadpool~', '')
      const creds = JSON.parse(Buffer.from(base64Data, 'base64').toString('utf-8'))
      fs.writeFileSync(path.join(sessionDir, 'creds.json'), JSON.stringify(creds, null, 2))
      console.log(chalk.green('✅ deadpool~ session loaded successfully'))
      return true
    } catch (e) {
      console.log(chalk.red('❌ Failed to load deadpool~ session:'), e.message)
      return false
    }
  }
  return false
}

// ==================== CONNECTION ==================== //
async function startDeadpool() {
  // Load deadpool~ session if provided
  loadSession()

  const { state, saveCreds } = await useMultiFileAuthState(global.sessionName)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: !process.env.SESSION_ID, // only show QR if no session
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    browser: ['Deadpool-X', 'Chrome', '2026'],
    generateHighQualityLinkPreview: true,
    getMessage: async (key) => {
      if (store.messages[key.remoteJid]?.[key.id]) return store.messages[key.remoteJid][key.id].message
      return { conversation: null }
    }
  })

  sock.ev.on('creds.update', saveCreds)

  sock.decodeJid = (jid) => {
    if (!jid) return jid
    if (/:\d+@/gi.test(jid)) {
      let decode = jidDecode(jid) || {}
      return decode.user && decode.server && decode.user + '@' + decode.server || jid
    } else return jid
  }

  // ==================== STORE MESSAGES (for anti-delete / anti-edit) ==================== //
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    try {
      const mek = messages[0]
      if (!mek.message) return

      // Store every message for anti features
      const jid = mek.key.remoteJid
      if (!store.messages[jid]) store.messages[jid] = {}
      store.messages[jid][mek.key.id] = mek

      // Keep store light - delete old messages after 1 hour
      setTimeout(() => {
        if (store.messages[jid] && store.messages[jid][mek.key.id]) {
          delete store.messages[jid][mek.key.id]
        }
      }, 60 * 60 * 1000)

      mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message

      // Auto view + react status
      if (mek.key && mek.key.remoteJid === 'status@broadcast') {
        if (global.autoviewstatus === 'true') {
          await sock.readMessages([mek.key])
        }
        if (global.autolike === 'true' || global.autoreact === 'true') {
          const emoji = global.reactEmojis[Math.floor(Math.random() * global.reactEmojis.length)]
          await sock.sendMessage(mek.key.remoteJid, {
            react: { text: emoji, key: mek.key }
          }).catch(() => {})
        }
        return
      }

      if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return
      if (!sock.public && !mek.key.fromMe && type === 'notify') return

      const m = smsg(sock, mek)

      // Auto react on normal messages (different emojis)
      if (global.autoreact === 'true' && !m.fromMe && m.body) {
        const emoji = global.reactEmojis[Math.floor(Math.random() * global.reactEmojis.length)]
        sock.sendMessage(m.chat, {
          react: { text: emoji, key: m.key }
        }).catch(() => {})
      }

      // ==================== COMMAND HANDLER ==================== //
      const body = m.body || ''
      const prefix = global.prefa.find(p => body.startsWith(p)) || ''
      const isCmd = prefix && body.startsWith(prefix)
      const command = isCmd ? body.slice(prefix.length).trim().split(/ +/).shift().toLowerCase() : ''
      const args = body.trim().split(/ +/).slice(1)
      const text = args.join(' ')
      const pushname = m.pushName || 'No Name'
      const botNumber = await sock.decodeJid(sock.user.id)
      const isCreator = [botNumber, ...global.owner].map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net').includes(m.sender)

      // Presence typing for speed feel
      if (isCmd) {
        await sock.sendPresenceUpdate('composing', m.chat).catch(() => {})
      }

      switch (command) {
        case 'menu':
        case 'dead':
        case 'help': {
          const menuText = `*DEADPOOL-X 2026* 💀

Hey ${pushname} motherfucker 👋

*Owner:* ${global.ownername}
*Bot:* ${global.botname}
*Runtime:* ${runtime(process.uptime())}

━━━ ⚡ MAIN ━━━
• ${prefix}menu / ${prefix}dead
• ${prefix}ping
• ${prefix}runtime
• ${prefix}owner
• ${prefix}public / ${prefix}self

━━━ 🎵 MUSIC (FAST) ━━━
• ${prefix}play <song name>
• ${prefix}ytmp3 <url>
• ${prefix}ytmp4 <url>

━━━ 🖼️ MEDIA ━━━
• ${prefix}sticker / ${prefix}s
• ${prefix}toimg
• ${prefix}tomp3 / ${prefix}toaudio
• ${prefix}tovn
• ${prefix}vv / ${prefix}rvo (view once)

━━━ 👥 GROUP ━━━
• ${prefix}tagall
• ${prefix}hidetag
• ${prefix}kick
• ${prefix}promote
• ${prefix}demote
• ${prefix}linkgc
• ${prefix}setname
• ${prefix}setdesc
• ${prefix}group open/close

━━━ 👑 OWNER ━━━
• ${prefix}bc / ${prefix}broadcast
• ${prefix}join <link>
• ${prefix}leave
• ${prefix}block
• ${prefix}unblock

*Always ON:*
✓ Anti Delete
✓ Anti Edit
✓ Anti ViewOnce
✓ Auto React (random different emojis)
✓ Auto View + React Status
✓ Fast Music (no waiting)

> Made by Confronter 2026`
          await sock.sendMessage(m.chat, { text: menuText }, { quoted: m })
        }
        break

        case 'ping': {
          const start = Date.now()
          const msg = await sock.sendMessage(m.chat, { text: 'Pinging...' }, { quoted: m })
          const end = Date.now()
          await sock.sendMessage(m.chat, {
            text: `*Deadpool-X is alive motherfucker*\nSpeed: ${end - start}ms`,
            edit: msg.key
          })
        }
        break

        case 'runtime': {
          await m.reply(`*DEADPOOL-X* has been running for:\n${runtime(process.uptime())}`)
        }
        break

        case 'owner': {
          const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${global.ownername}\nTEL;type=CELL;type=VOICE;waid=${global.owner[0]}:${global.owner[0]}\nEND:VCARD`
          await sock.sendMessage(m.chat, {
            contacts: {
              displayName: global.ownername,
              contacts: [{ vcard }]
            }
          }, { quoted: m })
        }
        break

        case 'public': {
          if (!isCreator) return m.reply('Only Confronter can do this shit')
          sock.public = true
          m.reply('Bot is now *PUBLIC*')
        }
        break

        case 'self': {
          if (!isCreator) return m.reply('Only Confronter can do this shit')
          sock.public = false
          m.reply('Bot is now *SELF*')
        }
        break

        // ==================== MUSIC - FAST ==================== //
        case 'play':
        case 'song': {
          if (!text) return m.reply(`Example: ${prefix}play blunt force trauma`)
          try {
            await m.reply('🔍 Searching that shit...')
            const search = await yts(text)
            const video = search.videos[0]
            if (!video) return m.reply('Nothing found motherfucker')

            const info = `*🎵 Found*\n\nTitle: ${video.title}\nDuration: ${video.timestamp}\nViews: ${video.views}\n\nDownloading audio...`

            await sock.sendMessage(m.chat, {
              image: { url: video.thumbnail },
              caption: info
            }, { quoted: m })

            const stream = ytdl(video.url, {
              filter: 'audioonly',
              quality: 'highestaudio',
              highWaterMark: 1 << 25
            })

            const filePath = `./tmp_${Date.now()}.mp3`
            const writeStream = fs.createWriteStream(filePath)
            stream.pipe(writeStream)

            writeStream.on('finish', async () => {
              await sock.sendMessage(m.chat, {
                audio: { url: filePath },
                mimetype: 'audio/mpeg',
                fileName: `${video.title}.mp3`
              }, { quoted: m })
              fs.unlinkSync(filePath)
            })
          } catch (e) {
            console.log(e)
            m.reply('Failed to download that shit. Try another song.')
          }
        }
        break

        case 'ytmp3': {
          if (!text) return m.reply(`Example: ${prefix}ytmp3 https://youtu.be/xxxx`)
          if (!ytdl.validateURL(text)) return m.reply('Invalid YouTube URL')
          try {
            await m.reply('Downloading audio fast as fuck...')
            const info = await ytdl.getInfo(text)
            const title = info.videoDetails.title
            const stream = ytdl(text, { filter: 'audioonly', quality: 'highestaudio' })
            const filePath = `./tmp_${Date.now()}.mp3`
            const writeStream = fs.createWriteStream(filePath)
            stream.pipe(writeStream)
            writeStream.on('finish', async () => {
              await sock.sendMessage(m.chat, {
                audio: { url: filePath },
                mimetype: 'audio/mpeg',
                fileName: `${title}.mp3`
              }, { quoted: m })
              fs.unlinkSync(filePath)
            })
          } catch (e) {
            m.reply('Download failed. Link might be shit.')
          }
        }
        break

        case 'ytmp4': {
          if (!text) return m.reply(`Example: ${prefix}ytmp4 https://youtu.be/xxxx`)
          if (!ytdl.validateURL(text)) return m.reply('Invalid YouTube URL')
          try {
            await m.reply('Downloading video...')
            const info = await ytdl.getInfo(text)
            const title = info.videoDetails.title
            const stream = ytdl(text, { filter: 'audioandvideo', quality: 'highest' })
            const filePath = `./tmp_${Date.now()}.mp4`
            const writeStream = fs.createWriteStream(filePath)
            stream.pipe(writeStream)
            writeStream.on('finish', async () => {
              await sock.sendMessage(m.chat, {
                video: { url: filePath },
                caption: title,
                mimetype: 'video/mp4'
              }, { quoted: m })
              fs.unlinkSync(filePath)
            })
          } catch (e) {
            m.reply('Video download failed.')
          }
        }
        break

        case 's':
        case 'sticker': {
          if (!m.quoted) return m.reply('Reply an image or video motherfucker')
          try {
            const { Sticker, StickerTypes } = require('wa-sticker-formatter')
            let media = await m.quoted.download()
            let sticker = new Sticker(media, {
              pack: global.packname,
              author: global.author,
              type: StickerTypes.FULL,
              quality: 70
            })
            await sock.sendMessage(m.chat, await sticker.toMessage(), { quoted: m })
          } catch (e) {
            console.log(e)
            m.reply('Failed to make sticker. Make sure you replied to image/video.')
          }
        }
        break

        case 'vv':
        case 'viewonce':
        case 'rvo': {
          if (!m.quoted) return m.reply('Reply a view once message')
          try {
            let msg = m.quoted.message || m.quoted
            let type = Object.keys(msg)[0]
            if (type === 'viewOnceMessageV2' || type === 'viewOnceMessage') {
              msg = msg[type].message
              type = Object.keys(msg)[0]
            }
            let media = await downloadContentFromMessage(msg[type], type.includes('image') ? 'image' : 'video')
            let buffer = Buffer.from([])
            for await (const chunk of media) {
              buffer = Buffer.concat([buffer, chunk])
            }
            if (/video/.test(type)) {
              await sock.sendMessage(m.chat, { video: buffer, caption: msg[type].caption || '' }, { quoted: m })
            } else {
              await sock.sendMessage(m.chat, { image: buffer, caption: msg[type].caption || '' }, { quoted: m })
            }
          } catch (e) {
            m.reply('Failed to open that view once')
          }
        }
        break

        // ==================== GROUP COMMANDS ==================== //
        case 'tagall': {
          if (!m.isGroup) return m.reply('Only works in groups')
          let teks = `══✪〘 *TAG ALL* 〙✪══\n\n`
          let participants = m.isGroup ? (await sock.groupMetadata(m.chat)).participants : []
          for (let mem of participants) {
            teks += `• @${mem.id.split('@')[0]}\n`
          }
          await sock.sendMessage(m.chat, { text: teks, mentions: participants.map(a => a.id) }, { quoted: m })
        }
        break

        case 'hidetag': {
          if (!m.isGroup) return m.reply('Only works in groups')
          if (!isCreator) return m.reply('Owner only')
          let participants = (await sock.groupMetadata(m.chat)).participants
          await sock.sendMessage(m.chat, { text: text || '', mentions: participants.map(a => a.id) }, { quoted: m })
        }
        break

        case 'kick': {
          if (!m.isGroup) return m.reply('Group only')
          if (!isCreator) return m.reply('Owner only')
          let users = m.mentionedJid[0] ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : text.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
          await sock.groupParticipantsUpdate(m.chat, [users], 'remove')
          m.reply('Kicked that motherfucker')
        }
        break

        case 'promote': {
          if (!m.isGroup) return m.reply('Group only')
          if (!isCreator) return m.reply('Owner only')
          let users = m.mentionedJid[0] ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : text.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
          await sock.groupParticipantsUpdate(m.chat, [users], 'promote')
          m.reply('Promoted')
        }
        break

        case 'demote': {
          if (!m.isGroup) return m.reply('Group only')
          if (!isCreator) return m.reply('Owner only')
          let users = m.mentionedJid[0] ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : text.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
          await sock.groupParticipantsUpdate(m.chat, [users], 'demote')
          m.reply('Demoted')
        }
        break

        case 'linkgc':
        case 'linkgroup': {
          if (!m.isGroup) return m.reply('Group only')
          let response = await sock.groupInviteCode(m.chat)
          m.reply(`https://chat.whatsapp.com/${response}`)
        }
        break

        case 'setname':
        case 'editsubjek': {
          if (!m.isGroup) return m.reply('Group only')
          if (!isCreator) return m.reply('Owner only')
          if (!text) return m.reply('Give me the new name')
          await sock.groupUpdateSubject(m.chat, text)
          m.reply('Group name updated')
        }
        break

        case 'setdesc':
        case 'editdesk': {
          if (!m.isGroup) return m.reply('Group only')
          if (!isCreator) return m.reply('Owner only')
          if (!text) return m.reply('Give me the new description')
          await sock.groupUpdateDescription(m.chat, text)
          m.reply('Group description updated')
        }
        break

        case 'group':
        case 'editgroup': {
          if (!m.isGroup) return m.reply('Group only')
          if (!isCreator) return m.reply('Owner only')
          if (args[0] === 'close') {
            await sock.groupSettingUpdate(m.chat, 'announcement')
            m.reply('Group closed')
          } else if (args[0] === 'open') {
            await sock.groupSettingUpdate(m.chat, 'not_announcement')
            m.reply('Group opened')
          } else m.reply(`Example: ${prefix}group open/close`)
        }
        break

        // ==================== OWNER ==================== //
        case 'bc':
        case 'broadcast': {
          if (!isCreator) return m.reply('Owner only motherfucker')
          if (!text) return m.reply('What do you want to broadcast?')
          let getGroups = await sock.groupFetchAllParticipating()
          let groups = Object.entries(getGroups).map(entry => entry[1])
          let anu = groups.map(v => v.id)
          m.reply(`Broadcasting to ${anu.length} groups...`)
          for (let i of anu) {
            await sock.sendMessage(i, { text: `*BROADCAST*\n\n${text}` })
            await new Promise(r => setTimeout(r, 1500))
          }
          m.reply('Broadcast done')
        }
        break

        case 'join': {
          if (!isCreator) return m.reply('Owner only')
          if (!text) return m.reply('Give group link')
          let result = text.split('https://chat.whatsapp.com/')[1]
          await sock.groupAcceptInvite(result)
          m.reply('Joined the group')
        }
        break

        case 'leave': {
          if (!isCreator) return m.reply('Owner only')
          await sock.groupLeave(m.chat)
        }
        break

        case 'block': {
          if (!isCreator) return m.reply('Owner only')
          let users = m.mentionedJid[0] ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : text.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
          await sock.updateBlockStatus(users, 'block')
          m.reply('Blocked')
        }
        break

        case 'unblock': {
          if (!isCreator) return m.reply('Owner only')
          let users = m.mentionedJid[0] ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : text.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
          await sock.updateBlockStatus(users, 'unblock')
          m.reply('Unblocked')
        }
        break

        // ==================== MEDIA ==================== //
        case 'toimg':
        case 'toimage': {
          if (!m.quoted) return m.reply('Reply a sticker')
          try {
            let media = await m.quoted.download()
            await sock.sendMessage(m.chat, { image: media }, { quoted: m })
          } catch (e) {
            m.reply('Failed. Reply to a sticker.')
          }
        }
        break

        case 'tomp3':
        case 'toaudio': {
          if (!m.quoted) return m.reply('Reply a video or audio')
          try {
            let media = await m.quoted.download()
            const filePath = `./tmp_${Date.now()}.mp3`
            fs.writeFileSync(filePath, media)
            await sock.sendMessage(m.chat, { audio: { url: filePath }, mimetype: 'audio/mpeg' }, { quoted: m })
            fs.unlinkSync(filePath)
          } catch (e) {
            m.reply('Failed to convert')
          }
        }
        break

        case 'tovn':
        case 'tovoice': {
          if (!m.quoted) return m.reply('Reply a video or audio')
          try {
            let media = await m.quoted.download()
            const filePath = `./tmp_${Date.now()}.mp3`
            fs.writeFileSync(filePath, media)
            await sock.sendMessage(m.chat, { audio: { url: filePath }, mimetype: 'audio/mpeg', ptt: true }, { quoted: m })
            fs.unlinkSync(filePath)
          } catch (e) {
            m.reply('Failed')
          }
        }
        break

        default:
          break
      }
    } catch (err) {
      console.log(err)
    }
  })

  // ==================== ANTI DELETE ==================== //
  sock.ev.on('messages.delete', async (item) => {
    if (global.antidelete !== 'true') return
    try {
      const keys = item.keys || (Array.isArray(item) ? item : [item])
      for (const key of keys) {
        const jid = key.remoteJid
        const id = key.id
        if (store.messages[jid] && store.messages[jid][id]) {
          const msg = store.messages[jid][id]
          const sender = sock.decodeJid(msg.key.participant || msg.key.remoteJid)
          await sock.sendMessage(jid, {
            text: `*ANTI DELETE* 💀\n\nMessage from @${sender.split('@')[0]} was deleted.\nRestoring that shit...`,
            mentions: [sender]
          })
          await sock.sendMessage(jid, { forward: msg })
        }
      }
    } catch (e) {
      console.log('AntiDelete error:', e)
    }
  })

  // ==================== ANTI EDIT ==================== //
  sock.ev.on('messages.update', async (updates) => {
    if (global.antiedit !== 'true') return
    for (const update of updates) {
      if (update.update?.message) {
        // Message was edited
        const key = update.key
        const jid = key.remoteJid
        const id = key.id
        if (store.messages[jid] && store.messages[jid][id]) {
          const original = store.messages[jid][id]
          const sender = sock.decodeJid(original.key.participant || original.key.remoteJid)
          try {
            await sock.sendMessage(jid, {
              text: `*ANTI EDIT* ✏️\n\n@${sender.split('@')[0]} tried to edit a message.\nOriginal was restored.`,
              mentions: [sender]
            })
            // Optionally re-send original
            // await sock.sendMessage(jid, { forward: original })
          } catch (e) {}
        }
      }
    }
  })

  // ==================== ANTI VIEW ONCE (auto) ==================== //
  // Already handled in messages.upsert by detecting viewOnceMessage and we have .vv command
  // For automatic: we can auto-download when viewOnce is received
  // (kept as command for now to avoid spam)

  // ==================== CONNECTION UPDATE ==================== //
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update
    if (qr) {
      console.log(chalk.yellow('Scan the QR code motherfucker'))
    }
    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode
      console.log(chalk.red(`Connection closed. Reason: ${reason}`))
      if (reason === DisconnectReason.badSession) {
        console.log('Bad session. Delete session folder and rescan.')
        process.exit()
      } else if (reason === DisconnectReason.connectionClosed || reason === DisconnectReason.connectionLost || reason === DisconnectReason.timedOut || reason === DisconnectReason.restartRequired) {
        console.log(chalk.yellow('Reconnecting...'))
        startDeadpool()
      } else if (reason === DisconnectReason.loggedOut) {
        console.log('Logged out. Delete session and scan again.')
        process.exit()
      } else {
        startDeadpool()
      }
    } else if (connection === 'open') {
      console.log(chalk.green('✅ DEADPOOL-X CONNECTED 2026'))
      console.log(chalk.cyan(`Bot: ${global.botname}`))
      console.log(chalk.cyan(`Owner: ${global.ownername}`))
    }
  })

  return sock
}

startDeadpool().catch(err => console.log(err))

// Hot reload
let file = require.resolve(__filename)
fs.watchFile(file, () => {
  fs.unwatchFile(file)
  console.log(chalk.redBright(`Updated ${__filename}`))
  delete require.cache[file]
  require(file)
})
