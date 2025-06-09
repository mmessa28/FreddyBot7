const { Boom } = require('@hapi/boom')
const makeWASocket = require('@whiskeysockets/baileys').default
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const { delay } = require('@whiskeysockets/baileys')
const fs = require('fs')
const path = require('path')

const badwords = ['idiot', 'hurensohn', 'fuck', 'bastard']
const groupLinkRegex = /chat\.whatsapp\.com\/[A-Za-z0-9]+/

async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState('auth')
    const { version } = await fetchLatestBaileysVersion()
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        version
    })

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        const msg = messages[0]
        if (!msg.message || msg.key.fromMe) return

        const from = msg.key.remoteJid
        const sender = msg.key.participant || msg.key.remoteJid
        const content = msg.message?.conversation?.toLowerCase() || ''

        if (groupLinkRegex.test(content)) {
            await sock.sendMessage(from, { text: `@${sender.split('@')[0]} wurde wegen Fremdwerbung entfernt.`, mentions: [sender] })
            await sock.groupParticipantsUpdate(from, [sender], 'remove')
            await sock.sendMessage(from, { delete: msg.key })
            return
        }

        const messagesInGroup = await sock.groupMessages(from, 5)
        const duplicates = messagesInGroup.filter(m => m.message?.conversation === msg.message?.conversation && m.key.participant === sender)
        if (duplicates.length >= 2) {
            await sock.sendMessage(from, { text: `@${sender.split('@')[0]}, bitte keine doppelten Nachrichten.`, mentions: [sender] })
            await sock.sendMessage(from, { delete: msg.key })
            return
        }

        if (badwords.some(w => content.includes(w))) {
            await sock.sendMessage(from, { text: `@${sender.split('@')[0]} wurde wegen Beleidigungen entfernt.`, mentions: [sender] })
            await sock.groupParticipantsUpdate(from, [sender], 'remove')
            await sock.sendMessage(from, { delete: msg.key })
        }
    })

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut
            if (shouldReconnect) {
                startSock()
            }
        } else if (connection === 'open') {
            console.log('✅ Freddy ist online.')
        }
    })

    sock.ev.on('creds.update', saveCreds)
}

startSock()
