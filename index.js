const { default: makeWASocket, useSingleFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

const { state, saveState } = useSingleFileAuthState('./auth_info.json');

const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true
});

sock.ev.on('connection.update', ({ connection, qr }) => {
    if (qr) {
        qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') {
        console.log('✅ Freddy ist jetzt verbunden!');
    }
});

sock.ev.on('creds.update', saveState);// Entry point for FreddyBot7Final
