'use strict';
let currentPage = 36;
let toastTimer;
const $ = (selector) => document.querySelector(selector);
const all = (selector) => [...document.querySelectorAll(selector)];
function announce(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2800);
}
function refresh() {
  all('[data-current]').forEach(el => { el.textContent = currentPage; });
  all('[data-percent]').forEach(el => { el.textContent = Math.round(currentPage / 240 * 100) + '%'; });
  all('[data-bar]').forEach(el => { el.style.width = (currentPage / 240 * 100) + '%'; });
  $('.next-page').innerHTML = currentPage < 240
    ? `下一次，从第 <b id="next-page">${currentPage + 1}</b> 页开始`
    : '这本书，你已经读完了 ✓';
  all('#today-page, #modal-page').forEach(el => { el.min = currentPage; });
  const finished = currentPage === 240;
  const firstBook = $('[data-book="山间来信 顾禾"]');
  firstBook.dataset.bookStatus = finished ? 'done' : 'reading';
  firstBook.querySelector('.status-badge').textContent = finished ? '已读完' : '正在读';
  firstBook.querySelector('.status-badge').className = 'status-badge ' + (finished ? 'done' : 'reading');
  $('[data-status="reading"] span').textContent = finished ? 0 : 1;
  $('[data-status="done"] span').textContent = finished ? 2 : 1;
  $('.library-footer span:last-child').textContent = `3 本藏书 · ${finished ? 2 : 1} 本已读`;
  filterBooks();
}
function save(input, error) {
  const value = input.value.trim();
  const next = Number(value);
  if (!value || !Number.isSafeInteger(next) || next < currentPage || next > 240) {
    error.textContent = `请输入 ${currentPage} 到 240 之间的整数页码。`;
    return false;
  }
  const gained = next - currentPage;
  currentPage = next;
  refresh();
  error.textContent = '';
  $('#today-result strong').textContent = gained ? `这次，你向前走了 ${gained} 页` : '当前进度已经记录';
  $('#today-result p').textContent = next === 240 ? '《山间来信》已读完。给自己一点肯定。' : `《山间来信》现在读到第 ${next} 页。`;
  announce(gained ? `已记录：第 ${next} 页，本次阅读 ${gained} 页` : `已记录：第 ${next} 页`);
  return true;
}
all('[data-route]').forEach(button => button.addEventListener('click', () => {
  const isLibrary = button.dataset.route === 'library';
  $('#library').hidden = !isLibrary;
  $('#today').hidden = isLibrary;
  all('[data-route]').forEach(el => {
    const selected = el === button;
    el.classList.toggle('selected', selected);
    el.setAttribute('aria-pressed', String(selected));
  });
  $('#route-summary').textContent = isLibrary
    ? 'A · 先浏览书架、搜索和筛选，再进入书籍更新进度。'
    : 'B · 打开就继续在读的书，直接记录本次阅读，再看其他书籍。';
  window.history.replaceState(null, '', isLibrary ? '#library' : '#today');
}));
all('[data-progress]').forEach(button => button.addEventListener('click', () => {
  $('#modal-page').value = Math.min(currentPage + 24, 240);
  $('#modal-error').textContent = '';
  $('#progress-dialog').showModal();
}));
$('#close-dialog').addEventListener('click', () => $('#progress-dialog').close());
$('#modal-progress').addEventListener('submit', event => {
  event.preventDefault();
  if (save($('#modal-page'), $('#modal-error'))) $('#progress-dialog').close();
});
$('#inline-progress').addEventListener('submit', event => {
  event.preventDefault();
  save($('#today-page'), $('#inline-error'));
});
function filterBooks() {
  const status = $('.status-tabs .active').dataset.status;
  const search = $('#search').value.trim().toLocaleLowerCase();
  let shown = 0;
  all('.book-card').forEach(el => {
    el.hidden = (status !== 'all' && el.dataset.bookStatus !== status) || !el.dataset.book.toLocaleLowerCase().includes(search);
    if (!el.hidden) shown++;
  });
  $('#empty').hidden = shown > 0;
}
all('[data-status]').forEach(button => button.addEventListener('click', () => {
  all('[data-status]').forEach(el => el.classList.toggle('active', el === button));
  filterBooks();
}));
$('#search').addEventListener('input', filterBooks);
$('#reset').addEventListener('click', () => {
  currentPage = 36;
  $('.next-page').innerHTML = '下一次，从第 <b id="next-page">37</b> 页开始';
  refresh();
  $('#today-page').value = 60;
  $('#today-result strong').textContent = '阅读是属于你的节奏';
  $('#today-result p').textContent = '记录之后，在这里看见本次推进的页数。';
  $('#inline-error').textContent = '';
  announce('已恢复到第 36 页，可以试用另一种方式');
});
if (window.location.hash === '#today') $('[data-route="today"]').click();
