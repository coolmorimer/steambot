'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Аккаунты
  accountsList:    ()       => ipcRenderer.invoke('accounts:list'),
  accountsLogin:   (name)   => ipcRenderer.invoke('accounts:login', name),
  accountsDelete:  (id)     => ipcRenderer.invoke('accounts:delete', id),

  // Кампании
  campaignsList:   ()       => ipcRenderer.invoke('campaigns:list'),
  campaignsSave:   (data)   => ipcRenderer.invoke('campaigns:save', data),
  campaignsDelete: (id)     => ipcRenderer.invoke('campaigns:delete', id),
  campaignsToggle: (id)     => ipcRenderer.invoke('campaigns:toggle', id),

  // Джобы
  jobsRecent:      (limit)  => ipcRenderer.invoke('jobs:recent', limit),
  jobsCancel:      (id)     => ipcRenderer.invoke('jobs:cancel', id),
  jobsDelete:      (id)     => ipcRenderer.invoke('jobs:delete', id),
  jobsClear:       ()       => ipcRenderer.invoke('jobs:clear'),

  // Бот
  botStatus:       ()       => ipcRenderer.invoke('bot:status'),
  botStart:        ()       => ipcRenderer.invoke('bot:start'),
  botStop:         ()       => ipcRenderer.invoke('bot:stop'),

  // Shell
  openUrl:         (url)    => ipcRenderer.invoke('shell:open', url),

  // Лицензия
  licenseCheck:      ()     => ipcRenderer.invoke('license:check'),
  licenseActivate:   (key)  => ipcRenderer.invoke('license:activate', key),
  licenseHwid:       ()     => ipcRenderer.invoke('license:hwid'),
  licenseDeactivate: ()     => ipcRenderer.invoke('license:deactivate'),

  // Настройки / Telegram
  settingsGet:       ()       => ipcRenderer.invoke('settings:get'),
  settingsSave:      (data)   => ipcRenderer.invoke('settings:save', data),
  telegramTest:      ()       => ipcRenderer.invoke('telegram:test'),

  // Инвентарь / AI
  inventoryFetch:       (profileId)            => ipcRenderer.invoke('inventory:fetch', profileId),
  inventoryGeneratePost:(profileId, useAI, useOllama, templateId) => ipcRenderer.invoke('inventory:generate-post', { profileId, useAI, useOllama, templateId }),
  inventoryHasOpenAIKey:()                     => ipcRenderer.invoke('inventory:has-openai-key'),
  inventoryTemplates:   ()                     => ipcRenderer.invoke('inventory:templates'),
  ollamaStatus:         ()                     => ipcRenderer.invoke('ollama:status'),

  // Подписка на push-события
  onJobUpdate:          (cb) => {
    ipcRenderer.on('job:update', (_, data) => cb(data));
  },
  onBotLog:             (cb) => {
    ipcRenderer.on('bot:log', (_, data) => cb(data));
  },
  onAccountExpired:     (cb) => {
    ipcRenderer.on('account:expired', (_, data) => cb(data));
  },
  onLoginStatus:        (cb) => {
    ipcRenderer.on('accounts:login-status', (_, data) => cb(data));
  },
  onBotStatusChanged:   (cb) => {
    ipcRenderer.on('bot:status-changed', (_, data) => cb(data));
  },
  onNgrokUrl:           (cb) => {
    ipcRenderer.on('settings:ngrok-url', (_, url) => cb(url));
  },
  removeAllListeners:   (channel) => {
    const allowed = ['job:update', 'bot:log', 'account:expired', 'accounts:login-status', 'bot:status-changed', 'settings:ngrok-url'];
    if (allowed.includes(channel)) ipcRenderer.removeAllListeners(channel);
  },
});
