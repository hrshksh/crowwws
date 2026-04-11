const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'site-content.json');

const DEFAULT_CONTENT = {
  authVisual: '',
};

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_CONTENT, null, 2), 'utf8');
  }
}

function readContent() {
  ensureStore();

  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return { ...DEFAULT_CONTENT, ...JSON.parse(raw) };
  } catch (err) {
    console.error('[ContentStore] Failed to read site content:', err);
    return { ...DEFAULT_CONTENT };
  }
}

function writeContent(nextContent) {
  ensureStore();
  fs.writeFileSync(DATA_FILE, JSON.stringify(nextContent, null, 2), 'utf8');
}

function getAuthVisual() {
  return readContent().authVisual || '';
}

function setAuthVisual(imageDataUrl) {
  const content = readContent();
  const nextContent = {
    ...content,
    authVisual: imageDataUrl,
  };

  writeContent(nextContent);
  return nextContent.authVisual;
}

module.exports = {
  getAuthVisual,
  setAuthVisual,
};
