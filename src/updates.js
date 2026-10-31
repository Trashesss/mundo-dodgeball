import { UPDATE_NOTICE, UPDATE_NOTICE_STORAGE_KEY } from './updates-data.js';

export function initUpdates() {
  const $ = id => document.getElementById(id);
  const dialog = $('updates-dialog');
  const button = $('updates-open');
  const menu = $('menu');
  let seen = false;
  let openedThisVisit = false;
  try {
    seen = localStorage.getItem(UPDATE_NOTICE_STORAGE_KEY) === UPDATE_NOTICE.id;
  } catch {}

  $('updates-highlights').replaceChildren(...UPDATE_NOTICE.highlights.map(item => {
    const row = document.createElement('li');
    const tag = document.createElement('span');
    tag.className = 'updates-tag';
    tag.textContent = item.tag;
    const copy = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = item.title;
    const description = document.createElement('p');
    description.textContent = item.description;
    copy.append(title, description);
    row.append(tag, copy);
    return row;
  }));

  const menuVisible = () => !menu.classList.contains('hidden');
  function open() {
    if (dialog.open || !menuVisible()) return;
    dialog.showModal();
    dialog.querySelector('.updates-body').scrollTop = 0;
    openedThisVisit = true;
    button.setAttribute('aria-expanded', 'true');
  }

  function showInitialNotice() {
    if (!menuVisible() || menu.classList.contains('practice-view')) return;
    if (!seen && !openedThisVisit && !document.querySelector('dialog[open]')) open();
  }

  button.addEventListener('click', open);
  $('updates-close').addEventListener('click', () => dialog.close());
  // Escape도 기본 dialog 동작으로 닫히며 동일하게 확인 여부를 저장한다.
  dialog.addEventListener('close', () => {
    seen = true;
    try {
      localStorage.setItem(UPDATE_NOTICE_STORAGE_KEY, UPDATE_NOTICE.id);
    } catch {}
    button.setAttribute('aria-expanded', 'false');
    $('updates-new').hidden = seen;
    if (menuVisible() && !menu.classList.contains('practice-view')) button.focus({ preventScroll: true });
  });

  new MutationObserver(() => {
    if (!menuVisible() && dialog.open) dialog.close();
    showInitialNotice();
  }).observe(menu, { attributes: true, attributeFilter: ['class'] });
  // 다른 모달이 먼저 열렸다면 닫힌 뒤 공지를 표시한다. 초대 링크의 대기실·경기는 가리지 않는다.
  document.addEventListener('close', () => requestAnimationFrame(showInitialNotice), true);
  $('updates-new').hidden = seen;
  showInitialNotice();
}
