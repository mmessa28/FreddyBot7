const { default: makeWASocket, useSingleFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeInMemoryStore, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');

const authFile = './auth_info.json';
const { state, saveState } = useSingleFileAuthState(authFile);

const bannedWords = ['hurensohn', 'f*ck', 'bastard'];
const groupLinkRegex = /chat\.whatsapp\.com\/[A-Za-z0-9]{20,24}/;
const warnedUsers = {};

async function startSock() {
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
        version,
        printQRInTerminal: true,
        auth: state,
        browser: Browsers.macOS("FreddyBot"),
    });

    sock.ev.on('creds.update', saveState);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.participant || msg.key.remoteJid;
        const messageContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        const lowerContent = messageContent.toLowerCase();
        const chat = msg.key.remoteJid;

        if (!chat.endsWith('@g.us')) return;

        // === Fremdwerbung ===
        if (groupLinkRegex.test(lowerContent)) {
            await sock.groupParticipantsUpdate(chat, [sender], 'remove');
            await sock.sendMessage(chat, { delete: msg.key });
            return;
        }

        // === Beleidigungen ===
        if (bannedWords.some(w => lowerContent.includes(w))) {
            await sock.groupParticipantsUpdate(chat, [sender], 'remove');
            await sock.sendMessage(chat, { delete: msg.key });
            return;
        }

        // === Doppelte Nachrichten / Spam ===
        const recentMessages = await sock.loadMessages(chat, 10);
        const sameMessages = recentMessages.messages.filter(m =>
            m.message &&
            (m.key.participant || m.key.remoteJid) === sender &&
            (m.message.conversation || m.message?.extendedTextMessage?.text) === messageContent
        );

        if (sameMessages.length > 1) {
            if (!warnedUsers[sender]) {
                warnedUsers[sender] = true;
                await sock.sendMessage(chat, { text: `⚠️ @${sender.split('@')[0]}, bitte keine doppelten Nachrichten.`, mentions: [sender] });
            } else {
                await sock.groupParticipantsUpdate(chat, [sender], 'remove');
                await sock.sendMessage(chat, { delete: msg.key });
            }
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startSock();
        }
    });
}

startSock();
