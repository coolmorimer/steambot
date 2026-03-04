'use strict';

/**
 * server/services/EmailService.js
 *
 * Отправка email-уведомлений через Nodemailer.
 * Если SMTP не настроен — логирует в консоль (dev-режим).
 */

const nodemailer = require('nodemailer');
const config     = require('../config');
const logger     = require('../logger');

let _transport = null;

function getTransport() {
  if (_transport) return _transport;

  if (config.email.enabled) {
    _transport = nodemailer.createTransport({
      host:   config.email.smtp.host,
      port:   config.email.smtp.port,
      secure: config.email.smtp.port === 465,
      auth: {
        user: config.email.smtp.user,
        pass: config.email.smtp.pass,
      },
    });
  } else {
    // Dev: вывод в консоль
    _transport = {
      sendMail: async (opts) => {
        logger.info(`[Email DEV] To: ${opts.to}\nSubject: ${opts.subject}\n${opts.text || opts.html}`);
        return { messageId: 'dev-' + Date.now() };
      },
    };
  }

  return _transport;
}

async function send({ to, subject, html, text }) {
  try {
    const transport = getTransport();
    await transport.sendMail({
      from:    config.email.from,
      to,
      subject,
      html,
      text: text || html?.replace(/<[^>]+>/g, ''),
    });
    logger.info(`[Email] Отправлено: ${subject} → ${to}`);
  } catch (err) {
    logger.error(`[Email] Ошибка отправки на ${to}: ${err.message}`);
  }
}

// ── Шаблоны писем ────────────────────────────────────────────────────────────

function welcomeEmail(name, appUrl) {
  return {
    subject: '🎮 Добро пожаловать в Steam Poster Bot!',
    html: `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
  <h2 style="color:#66c0f4;">🎮 Steam Poster Bot</h2>
  <p>Привет, <b>${name}</b>!</p>
  <p>Ваш аккаунт успешно создан. Пробный период: <b>3 дня бесплатно</b>.</p>
  <a href="${appUrl}/dashboard" style="display:inline-block;background:#66c0f4;color:#1b2838;
     padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0;">
    Открыть Dashboard →
  </a>
  <p style="color:#888;font-size:13px;">Steam Poster Bot — автопостинг в форумы Steam</p>
</div>`,
  };
}

function passwordResetEmail(name, resetUrl) {
  return {
    subject: '🔐 Сброс пароля Steam Poster Bot',
    html: `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
  <h2 style="color:#66c0f4;">Сброс пароля</h2>
  <p>Привет, <b>${name || 'пользователь'}</b>!</p>
  <p>Нажмите кнопку ниже для сброса пароля. Ссылка действительна 1 час.</p>
  <a href="${resetUrl}" style="display:inline-block;background:#c6423f;color:#fff;
     padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0;">
    Сбросить пароль
  </a>
  <p style="color:#888;font-size:13px;">Если вы не запрашивали сброс — проигнорируйте письмо.</p>
</div>`,
  };
}

function subscriptionEmail(name, planName, expiresAt) {
  return {
    subject: `✅ Подписка ${planName} активирована`,
    html: `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
  <h2 style="color:#66c0f4;">✅ Подписка активирована!</h2>
  <p>Привет, <b>${name}</b>!</p>
  <p>Ваш план <b>${planName}</b> успешно активирован.</p>
  ${expiresAt ? `<p>Действует до: <b>${new Date(expiresAt).toLocaleDateString('ru-RU')}</b></p>` : ''}
  <p style="color:#888;font-size:13px;">Steam Poster Bot</p>
</div>`,
  };
}

// ── Обёртки для отправки ─────────────────────────────────────────────────────

async function sendWelcomeEmail(to, name) {
  const tpl = welcomeEmail(name, config.appUrl);
  return send({ to, ...tpl });
}

async function sendPasswordResetEmail(to, resetUrl) {
  const tpl = passwordResetEmail(to, resetUrl);
  return send({ to, ...tpl });
}

async function sendSubscriptionEmail(to, name, planName, expiresAt) {
  const tpl = subscriptionEmail(name, planName, expiresAt);
  return send({ to, ...tpl });
}

function verificationEmail(name, verifyUrl) {
  return {
    subject: '📧 Подтвердите email — Steam Poster Bot',
    html: `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
  <h2 style="color:#66c0f4;">📧 Подтверждение email</h2>
  <p>Привет, <b>${name || 'пользователь'}</b>!</p>
  <p>Нажмите кнопку ниже для подтверждения вашего email-адреса. Ссылка действительна 24 часа.</p>
  <a href="${verifyUrl}" style="display:inline-block;background:#66c0f4;color:#1b2838;
     padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0;">
    Подтвердить email
  </a>
  <p style="color:#888;font-size:13px;">Если вы не регистрировались — проигнорируйте письмо.</p>
</div>`,
  };
}

async function sendVerificationEmail(to, name, verifyUrl) {
  const tpl = verificationEmail(name, verifyUrl);
  return send({ to, ...tpl });
}

module.exports = {
  send,
  welcomeEmail, passwordResetEmail, subscriptionEmail, verificationEmail,
  sendWelcomeEmail, sendPasswordResetEmail, sendSubscriptionEmail, sendVerificationEmail,
};
