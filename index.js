import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, DisconnectReason } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import fs from "fs";
import path from "path";

const bannedWords = ["hurensohn", "f*ck", "bastard"];
const groupLinkRegex = /chat\.whatsapp\.com\/[A-Za-z0-9]{20,24}/;

const { state, saveCreds } = await useMultiFileAuthState("auth");
const { version, isLatest } = await fetchLatestBaileysVersion();

const sock = makeWASocket({
  version,
  auth: {
    creds: state.creds,
    keys: makeCacheableSignalKeyStore(state.keys, fs),
  },
  printQRInTerminal: true,
});

sock.ev.on("creds.update", saveCreds);

sock.ev.on("messages.upsert", async ({ messages, type }) => {
  const msg = messages[0];
  if (!msg.message || type !== "notify") return;

  const sender = msg.key.participant || msg.key.remoteJid;
  const content = msg.message.conversation || msg.message.extendedTextMessage?.text;
  const from = msg.key.remoteJid;

  if (!content || !from.includes("@g.us")) return;

  const chat = await sock.groupMetadata(from);

  // Fremdwerbung
  if (groupLinkRegex.test(content)) {
    await sock.groupParticipantsUpdate(from, [sender], "remove");
    await sock.sendMessage(from, {
      text: `@${sender.split("@")[0]} wurde wegen Fremdwerbung entfernt.`,
      mentions: [sender],
    });
    await sock.sendMessage(from, { delete: msg.key });
    return;
  }

  // Beleidigungen
  if (bannedWords.some((w) => content.toLowerCase().includes(w))) {
    await sock.groupParticipantsUpdate(from, [sender], "remove");
    await sock.sendMessage(from, {
      text: `@${sender.split("@")[0]} wurde wegen Beleidigung entfernt.`,
      mentions: [sender],
    });
    await sock.sendMessage(from, { delete: msg.key });
    return;
  }

  // Doppelte Nachrichten
  const recentMessages = await sock.loadMessages(from, 5);
  const sameMessages = recentMessages.filter((m) => m.message?.conversation === content && m.key.participant === sender);
  if (sameMessages.length > 1) {
    await sock.sendMessage(from, {
      text: `@${sender.split("@")[0]}, bitte keine doppelten Nachrichten.`,
      mentions: [sender],
    });
    await sock.sendMessage(from, { delete: msg.key });
  }
});
