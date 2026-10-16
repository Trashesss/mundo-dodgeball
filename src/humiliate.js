// 친구와 1대1 승자의 굴욕 공유: 상대 이름을 넣은 문구와 짤 미리보기 링크를 복사한다
import { track, createTrackingId } from './analytics.js';
import { HUMILIATE_PATH, humiliateText } from './share.js';

const $ = (id) => document.getElementById(id);
const dialog = $('humiliate-dialog');
let properties = {};
let snackbarTimer;

const updatePreview = () => { $('humiliate-preview').textContent = humiliateText($('humiliate-name').value); };

function showSnackbar(text) {
  clearTimeout(snackbarTimer);
  $('copy-snackbar').textContent = text;
  $('copy-snackbar').classList.add('visible');
  snackbarTimer = setTimeout(() => {
    $('copy-snackbar').classList.remove('visible');
    $('copy-snackbar').textContent = '';
  }, 2000);
}

export function setHumiliateAvailable(available, matchProperties = {}) {
  properties = matchProperties;
  $('humiliate-btn').classList.toggle('hidden', !available);
  if (!available && dialog.open) dialog.close();
}

$('humiliate-btn').addEventListener('click', () => {
  $('humiliate-status').textContent = '';
  updatePreview();
  dialog.showModal();
  track('humiliate_clicked', properties);
});
$('humiliate-name').addEventListener('input', updatePreview);
$('humiliate-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  if (!$('result').classList.contains('hidden')) $('humiliate-btn').focus({ preventScroll: true });
});
$('humiliate-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const shareId = createTrackingId();
  const url = new URL(HUMILIATE_PATH, new URL(location.pathname, location.origin));
  url.searchParams.set('share_id', shareId);
  url.searchParams.set('utm_source', 'friend');
  url.searchParams.set('utm_medium', 'humiliate');
  const shareProperties = { ...properties, kind: 'humiliate', share_id: shareId };
  try {
    await navigator.clipboard.writeText(`${humiliateText($('humiliate-name').value)}\n${url.href}`);
    track('share_completed', { ...shareProperties, method: 'clipboard' });
    dialog.close();
    showSnackbar('굴욕 링크 복사 완료! 상대에게 보내 보세요.');
  } catch {
    track('share_failed', { ...shareProperties, method: 'clipboard' });
    $('humiliate-status').textContent = '복사하지 못했어요. 브라우저의 클립보드 권한을 확인하고 다시 눌러 주세요.';
  }
});
// 재대결·뒤로가기로 결과 화면이 닫히면 모달도 함께 닫는다
new MutationObserver(() => {
  if ($('result').classList.contains('hidden') && dialog.open) dialog.close();
}).observe($('result'), { attributes: true, attributeFilter: ['class'] });
