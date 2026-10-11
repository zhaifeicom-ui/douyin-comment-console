'use strict';

const fs = require('fs');
const path = require('path');

const APP_ROOT = path.resolve(__dirname, '..');

function getDataDir() {
  return path.resolve(process.env.COMMENT_CONSOLE_DATA_DIR || APP_ROOT);
}

function getConfigPath() {
  return path.resolve(process.env.COMMENT_CONSOLE_CONFIG_PATH || path.join(getDataDir(), 'config.json'));
}

function getStorageDir() {
  return path.resolve(process.env.DOUYIN_STORAGE_DIR || path.join(getDataDir(), 'storage'));
}

function getLogDir() {
  return path.resolve(process.env.DOUYIN_LOG_DIR || path.join(getDataDir(), 'logs'));
}

function getDownloadsDir() {
  return path.resolve(process.env.DOUYIN_DOWNLOADS_DIR || path.join(getDataDir(), 'downloads'));
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'));
  } catch (_) {
    return {};
  }
}

module.exports = {
  APP_ROOT,
  getDataDir,
  getConfigPath,
  getStorageDir,
  getLogDir,
  getDownloadsDir,
  readConfig,
};
