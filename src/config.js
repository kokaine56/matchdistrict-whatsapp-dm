import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.resolve(__dirname, '../config.json');

const DEFAULT_CONFIG = {
  campaign: {
    template: '',
    languageCode: '',
    headerImageUrl: '',
    bodyVariables: [],
    urlButtonValue: '',
    quickReplyPayloads: []
  },
  autoReply: {
    type: 'text',
    text: 'Hello! Thank you for reaching out. We will get back to you shortly.',
    imageUrl: '',
    caption: '',
    buttons: [
      { id: 'btn_1', title: 'Option 1', reply: 'Thank you for selecting Option 1!' },
      { id: 'btn_2', title: 'Option 2', reply: 'Thank you for selecting Option 2!' }
    ],
    link: {
      title: 'Visit Website',
      url: 'https://matchdistrict.com'
    }
  }
};

export async function loadConfig() {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      campaign: { ...DEFAULT_CONFIG.campaign, ...(parsed.campaign || {}) },
      autoReply: { ...DEFAULT_CONFIG.autoReply, ...(parsed.autoReply || {}) }
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

