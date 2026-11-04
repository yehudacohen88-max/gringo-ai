// Web privacy panel: notice, consent, withdraw, export, delete with code.
// Labels exist in he/en/th (the notice languages); other UI languages use en.
(function () {
  const COPY = {
    en: {
      button: 'Privacy', title: 'Your privacy', accept: 'I agree', decline: 'I do not agree', withdraw: 'Withdraw consent',
      export: 'Download my data', deleteStart: 'Delete my data', deleteConfirm: 'Confirm deletion', retry: 'Try the deletion again',
      codeLabel: 'Type this code to confirm: {code}', close: 'Close', statusAccepted: 'You agreed to the privacy notice.',
      statusNone: 'Gringo saves nothing personal until you agree.', statusWithdrawn: 'Consent withdrawn. Gringo does not process your data.',
      statusPending: 'Your deletion is not finished yet. Gringo is blocked from using your data.', failed: 'Something went wrong. Please try again.',
      consentRequired: 'Please read and accept the privacy notice first.',
    },
    he: {
      button: 'פרטיות', title: 'הפרטיות שלך', accept: 'אני מסכים/ה', decline: 'אני לא מסכים/ה', withdraw: 'ביטול הסכמה',
      export: 'הורדת המידע שלי', deleteStart: 'מחיקת המידע שלי', deleteConfirm: 'אישור מחיקה', retry: 'לנסות שוב את המחיקה',
      codeLabel: 'הקלד/י את הקוד הזה לאישור: {code}', close: 'סגירה', statusAccepted: 'הסכמת להודעת הפרטיות.',
      statusNone: 'Gringo לא שומר מידע אישי עד שתסכים/י.', statusWithdrawn: 'ההסכמה בוטלה. Gringo לא מעבד את המידע שלך.',
      statusPending: 'המחיקה עוד לא הסתיימה. Gringo חסום משימוש במידע שלך.', failed: 'משהו השתבש. נא לנסות שוב.',
      consentRequired: 'נא לקרוא ולאשר קודם את הודעת הפרטיות.',
    },
    th: {
      button: 'ความเป็นส่วนตัว', title: 'ความเป็นส่วนตัวของคุณ', accept: 'ฉันยอมรับ', decline: 'ฉันไม่ยอมรับ', withdraw: 'ถอนความยินยอม',
      export: 'ดาวน์โหลดข้อมูลของฉัน', deleteStart: 'ลบข้อมูลของฉัน', deleteConfirm: 'ยืนยันการลบ', retry: 'ลองลบอีกครั้ง',
      codeLabel: 'พิมพ์รหัสนี้เพื่อยืนยัน: {code}', close: 'ปิด', statusAccepted: 'คุณยอมรับประกาศความเป็นส่วนตัวแล้ว',
      statusNone: 'Gringo จะไม่บันทึกข้อมูลส่วนตัวจนกว่าคุณจะยอมรับ', statusWithdrawn: 'ถอนความยินยอมแล้ว Gringo จะไม่ประมวลผลข้อมูลของคุณ',
      statusPending: 'การลบยังไม่เสร็จ Gringo ถูกบล็อกไม่ให้ใช้ข้อมูลของคุณ', failed: 'มีบางอย่างผิดพลาด โปรดลองอีกครั้ง',
      consentRequired: 'โปรดอ่านและยอมรับประกาศความเป็นส่วนตัวก่อน',
    },
  };

  function lang() {
    const fromDoc = (document.documentElement.lang || navigator.language || 'en').slice(0, 2).toLowerCase();
    const chosen = window.gringoUiLanguage ? window.gringoUiLanguage() : fromDoc;
    return COPY[chosen] ? chosen : 'en';
  }
  function t(key, vars = {}) {
    const text = (COPY[lang()] || COPY.en)[key] || COPY.en[key] || key;
    return text.replace(/\{(\w+)\}/g, (m, name) => (vars[name] !== undefined ? String(vars[name]) : m));
  }

  async function api(method, url, payload) {
    const response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'accept-language': lang() },
      body: method === 'GET' ? undefined : JSON.stringify({ ...(payload || {}), language: lang() }),
    });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, ok: response.ok, body };
  }

  let panel;
  function el(tag, attrs = {}, text) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(label, onClick, secondary) {
    const b = el('button', { type: 'button', class: secondary ? 'button button-secondary button-small' : 'button button-small' }, label);
    b.addEventListener('click', onClick);
    return b;
  }

  async function render(message) {
    if (!panel) {
      panel = el('section', { id: 'privacyPanel', class: 'profile-panel', role: 'dialog', 'aria-labelledby': 'privacyTitle' });
      const anchor = document.querySelector('#chatAlert') || document.body.firstChild;
      anchor.parentNode.insertBefore(panel, anchor.nextSibling);
    }
    panel.hidden = false;
    panel.replaceChildren();
    const [noticeResult, statusResult] = await Promise.all([
      api('GET', `/api/privacy/notice?lang=${encodeURIComponent(lang())}`),
      api('GET', '/api/privacy/status'),
    ]);
    const notice = (noticeResult.body && noticeResult.body.notice) || {};
    const status = statusResult.body || {};
    panel.appendChild(el('h2', { id: 'privacyTitle' }, notice.title || t('title')));
    if (message) panel.appendChild(el('p', { class: 'alert alert-info', 'data-privacy-message': '1' }, message));
    for (const line of [...(notice.summary || []), ...(notice.rights || [])]) panel.appendChild(el('p', {}, line));
    if (notice.limits) panel.appendChild(el('p', { class: 'muted' }, notice.limits));
    const state = status.deletionPending ? 'statusPending' : status.accepted ? 'statusAccepted' : status.status === 'withdrawn' ? 'statusWithdrawn' : 'statusNone';
    panel.appendChild(el('p', { 'data-privacy-state': state }, t(state)));
    const actions = el('div', { class: 'row-actions' });
    if (status.deletionPending) {
      actions.appendChild(button(t('retry'), () => runAndShow(() => api('POST', '/api/privacy/delete-retry'))));
    } else {
      if (!status.accepted) {
        actions.appendChild(button(t('accept'), () => runAndShow(() => api('POST', '/api/privacy/consent', { accept: true, consentVersion: notice.version }))));
        actions.appendChild(button(t('decline'), () => runAndShow(() => api('POST', '/api/privacy/consent', { accept: false })), true));
      } else {
        actions.appendChild(button(t('withdraw'), () => runAndShow(() => api('POST', '/api/privacy/withdraw')), true));
      }
      actions.appendChild(button(t('export'), downloadExport, true));
      actions.appendChild(button(t('deleteStart'), startDelete, true));
    }
    actions.appendChild(button(t('close'), () => { panel.hidden = true; }, true));
    panel.appendChild(actions);
  }

  async function runAndShow(action) {
    try {
      const result = await action();
      const msg = (result.body && (result.body.message || (result.body.error && result.body.error.message))) || (result.ok ? '' : t('failed'));
      await render(msg);
    } catch (error) {
      await render(t('failed'));
    }
  }

  async function downloadExport() {
    const result = await api('GET', '/api/privacy/export');
    if (!result.ok) return render(t('failed'));
    const blob = new Blob([JSON.stringify(result.body, null, 2)], { type: 'application/json' });
    const link = el('a', { href: URL.createObjectURL(blob), download: 'gringo-my-data.json' });
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function startDelete() {
    const result = await api('POST', '/api/privacy/delete-request');
    if (!result.ok || !result.body.confirmationCode) return render(t('failed'));
    await render(result.body.notDeleted || '');
    const form = el('div', { class: 'row-actions' });
    form.appendChild(el('label', { for: 'privacyDeleteCode' }, t('codeLabel', { code: result.body.confirmationCode })));
    const input = el('input', { id: 'privacyDeleteCode', inputmode: 'numeric', autocomplete: 'off' });
    form.appendChild(input);
    form.appendChild(button(t('deleteConfirm'), () => runAndShow(() => api('POST', '/api/privacy/delete', { confirm: true, confirmationCode: input.value.trim() }))));
    panel.insertBefore(form, panel.lastChild);
  }

  function open(reason) {
    return render(reason === 'CONSENT_REQUIRED' ? t('consentRequired') : '');
  }

  window.gringoPrivacy = { open, copy: COPY };

  document.addEventListener('DOMContentLoaded', async () => {
    const nav = document.querySelector('#profileButton');
    if (nav) nav.parentNode.insertBefore(button(t('button'), () => open(), true), nav.nextSibling);
    try {
      const status = await api('GET', '/api/privacy/status');
      if (status.ok && (status.body.needsConsent && status.body.gateEnabled || status.body.deletionPending)) open('CONSENT_REQUIRED');
    } catch (error) {
      // Status is optional on load; the chat still shows the panel on CONSENT_REQUIRED.
    }
  });

  if (typeof module !== 'undefined') module.exports = { COPY };
})();
