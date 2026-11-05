import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.resolve(__dirname, '../config.json');

const DEFAULT_CONFIG = {
  autoReplyEnabled: true,
  campaign: {
    template: '',
    languageCode: '',
    headerImageUrl: '',
    bodyVariables: [],
    urlButtonValue: '',
    quickReplyPayloads: [],
    headers: {}
  },
  autoReply: {
    type: 'link',
    text: "🏆 PRIZE POOL – ₹10,000\n🔥 REGISTRATION LIVE!\nSecure your spot now. Join ASAP and compete for the prize!\n\nRegister Now | Match District",
    imageUrl: '',
    caption: '',
    buttons: [],
    link: {
      title: 'Discord',
      url: 'https://discord.gg/zMVN8ZmqTP'
    }
  }
};

export async function loadConfig() {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    const parsedAutoReply = parsed.autoReply || {};
    return {
      autoReplyEnabled: parsed.autoReplyEnabled !== false,
      campaign: { ...DEFAULT_CONFIG.campaign, ...(parsed.campaign || {}) },
      autoReply: {
        ...DEFAULT_CONFIG.autoReply,
        ...parsedAutoReply,
        type: 'link',
        text: parsedAutoReply.text || DEFAULT_CONFIG.autoReply.text,
        link: {
          ...DEFAULT_CONFIG.autoReply.link,
          ...(parsedAutoReply.link || {})
        }
      }
    };
  } catch (err) {
    if (err.code === 'ENOENT') {
      await saveConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }
    console.error('Error loading config.json:', err.message);
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(newConfig) {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(newConfig, null, 2), 'utf-8');
  return newConfig;
}

