const CSV_COLUMNS = ['title', 'author', 'total_pages', 'current_page'];
const MAX_BOOK_TEXT = 120;
const MAX_TOTAL_PAGES = 1000000;
const MAX_NOTE_TEXT = 5000;

function pageNumber(value, label, minimum = 0) {
  let number;
  if (typeof value === 'number') {
    number = value;
  } else if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    number = Number(value.trim());
  } else {
    throw new Error(`${label}必须是${minimum === 1 ? '大于 0 的' : '不小于 0 的'}整数。`);
  }
  if (!Number.isSafeInteger(number) || number < minimum) {
    throw new Error(`${label}必须是${minimum === 1 ? '大于 0 的' : '不小于 0 的'}安全整数。`);
  }
  return number;
}

function stableHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function normalizeBook(book) {
  if (!book || typeof book !== 'object' || Array.isArray(book)) {
    throw new Error('书籍数据格式无效。');
  }
  if (typeof book.title !== 'string' || !book.title.trim()) {
    throw new Error('请填写书名。');
  }
  if (book.author !== undefined && typeof book.author !== 'string') {
    throw new Error('作者必须是文字。');
  }
  if (book.title.length > MAX_BOOK_TEXT || (book.author ?? '').length > MAX_BOOK_TEXT) {
    throw new Error('书名和作者各自不能超过 120 个字符。');
  }
  const title = book.title.trim();
  const author = (book.author ?? '').trim();
  const totalPages = pageNumber(book.totalPages === undefined ? book.total_pages : book.totalPages, '总页数', 1);
  if (totalPages > MAX_TOTAL_PAGES) throw new Error('总页数不能超过 1000000。');
  const rawCurrentPage = book.currentPage === undefined ? book.current_page : book.currentPage;
  const currentPage = pageNumber(rawCurrentPage === undefined ? 0 : rawCurrentPage, '当前页数');
  if (currentPage > totalPages) {
    throw new Error('当前页数不能超过总页数。');
  }
  if (book.id !== undefined && (typeof book.id !== 'string' || !book.id.trim())) {
    throw new Error('书籍编号无效。');
  }
  const id = book.id === undefined ? `book-${stableHash(`${title}\u0000${author}`)}` : book.id.trim();
  return { id, title, author, totalPages, currentPage };
}

export function validateBook(book) {
  return normalizeBook(book);
}

export function statusOf(book) {
  const { currentPage, totalPages } = validateBook(book);
  if (currentPage === 0) return 'want';
  if (currentPage === totalPages) return 'finished';
  return 'reading';
}

export function percentOf(book) {
  const { currentPage, totalPages } = validateBook(book);
  return Math.round((currentPage / totalPages) * 100);
}

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

export function parseCSV(text) {
  if (typeof text !== 'string' || !text.replace(/^\uFEFF/, '').trim()) {
    throw new Error('CSV 文件为空或格式无效。');
  }
  const source = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let mode = 'unquoted';
  const endField = () => {
    row.push(field);
    field = '';
    mode = 'unquoted';
  };
  const endRow = () => {
    endField();
    if (row.length > 1 || row.some((cell) => cell.trim())) rows.push(row);
    row = [];
  };

  for (let i = 0; i < source.length; i += 1) {
    const character = source[i];
    if (mode === 'quoted') {
      if (character === '"') mode = 'afterQuote';
      else field += character;
      continue;
    }
    if (mode === 'afterQuote' && character === '"') {
      field += '"';
      mode = 'quoted';
      continue;
    }
    if (character === ',') {
      endField();
    } else if (character === '\r' || character === '\n') {
      endRow();
      if (character === '\r' && source[i + 1] === '\n') i += 1;
    } else if (mode === 'afterQuote' || mode === 'afterQuoteWhitespace') {
      if (character !== ' ' && character !== '\t') {
        throw new Error('CSV 格式无效：结束引号后只能出现分隔符或换行。');
      }
      mode = 'afterQuoteWhitespace';
    } else if (character === '"') {
      if (field.length !== 0) throw new Error('CSV 格式无效：引号必须出现在字段开头。');
      mode = 'quoted';
    } else {
      field += character;
    }
  }
  if (mode === 'quoted') throw new Error('CSV 格式无效：引号未闭合。');
  if (field.length || row.length || mode === 'afterQuote' || mode === 'afterQuoteWhitespace') endRow();
  if (!rows.length) throw new Error('CSV 文件没有列名。');

  const headers = rows[0].map((header) => header.trim());
  if (new Set(headers).size !== headers.length) throw new Error('CSV 列名不能重复。');
  for (const column of CSV_COLUMNS) {
    if (!headers.includes(column)) throw new Error(`CSV 缺少必需列：${column}。`);
  }
  return rows.slice(1).map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`CSV 第 ${index + 2} 行的列数不正确。`);
    const record = Object.fromEntries(headers.map((header, position) => [header, cells[position]]));
    try {
      return normalizeBook(record);
    } catch (error) {
      throw new Error(`CSV 第 ${index + 2} 行：${error.message}`);
    }
  });
}

export function newState(books) {
  if (!Array.isArray(books)) throw new Error('书籍列表格式无效。');
  const usedIds = new Set();
  const normalizedBooks = Array.from(books, (book) => {
    const normalized = normalizeBook(book);
    const baseId = normalized.id;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    usedIds.add(id);
    return { ...normalized, id };
  });
  return { version: 1, books: normalizedBooks, notes: [], sessions: [] };
}

function validId(value, label) {
  if (typeof value !== 'string' || !value || value !== value.trim()) {
    throw new Error(`${label}无效。`);
  }
  return value;
}

function persistedPage(value, label, minimum = 0, maximum = MAX_TOTAL_PAGES) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label}必须是 ${minimum} 到 ${maximum} 之间的整数。`);
  }
  return value;
}

function validISOTime(value) {
  if (typeof value !== 'string') throw new Error('记录时间必须是有效的 ISO 时间。');
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) throw new Error('记录时间必须是有效的 ISO 时间。');
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const zoneValid = zone === 'Z' || (Number(zone.slice(1, 3)) <= 23 && Number(zone.slice(4, 6)) <= 59);
  if (month < 1 || month > 12 || day < 1 || day > monthDays[month - 1] || hour > 23 || minute > 59 || second > 59 || !zoneValid || !Number.isFinite(Date.parse(value))) {
    throw new Error('记录时间必须是有效的 ISO 时间。');
  }
  return value;
}

function recordObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}格式无效。`);
  return value;
}

export function validateState(raw) {
  recordObject(raw, '阅读数据');
  if (raw.version !== 1 || !Array.isArray(raw.books) || !Array.isArray(raw.notes) || !Array.isArray(raw.sessions)) {
    throw new Error('阅读数据版本或列表格式无效。');
  }
  const ids = new Set();
  const claimId = (value, label) => {
    const id = validId(value, label);
    if (ids.has(id)) throw new Error('阅读数据中的编号不能重复。');
    ids.add(id);
    return id;
  };
  const books = Array.from(raw.books, (value) => {
    const book = recordObject(value, '书籍数据');
    claimId(book.id, '书籍编号');
    persistedPage(book.totalPages, '总页数', 1);
    persistedPage(book.currentPage, '当前页数', 0, book.totalPages);
    return normalizeBook(book);
  });
  const booksById = new Map(books.map((book) => [book.id, book]));
  const referencedBook = (bookId) => {
    validId(bookId, '关联书籍编号');
    const book = booksById.get(bookId);
    if (!book) throw new Error('笔记或阅读记录关联的书籍不存在。');
    return book;
  };
  const notes = Array.from(raw.notes, (value) => {
    const note = recordObject(value, '笔记');
    const id = claimId(note.id, '笔记编号');
    const book = referencedBook(note.bookId);
    if (typeof note.text !== 'string' || note.text.length > MAX_NOTE_TEXT) {
      throw new Error('笔记必须是文字，且不能超过 5000 个字符。');
    }
    const page = persistedPage(note.page, '笔记所在页数', 0, book.totalPages);
    const createdAt = validISOTime(note.createdAt);
    return { id, bookId: book.id, text: note.text, page, createdAt };
  });
  const sessions = Array.from(raw.sessions, (value) => {
    const session = recordObject(value, '阅读记录');
    const id = claimId(session.id, '阅读记录编号');
    const book = referencedBook(session.bookId);
    const fromPage = persistedPage(session.fromPage, '起始页数', 0, book.totalPages);
    const toPage = persistedPage(session.toPage, '结束页数', 1, book.totalPages);
    const pages = persistedPage(session.pages, '本次阅读页数', 1, book.totalPages);
    if (toPage <= fromPage || pages !== toPage - fromPage) {
      throw new Error('阅读记录必须向前阅读，且新增页数须与起止页数一致。');
    }
    const createdAt = validISOTime(session.createdAt);
    return { id, bookId: book.id, fromPage, toPage, pages, createdAt };
  });
  const state = { version: 1, books, notes, sessions };
  if (Object.hasOwn(raw, 'activeBookId')) {
    state.activeBookId = typeof raw.activeBookId === 'string' && booksById.has(raw.activeBookId) ? raw.activeBookId : null;
  }
  return state;
}

function csvText(value) {
  const protectedValue = /^(?:[=+\-@\t\r\n]|\s+[=+\-@])/.test(value) ? `'${value}` : value;
  return `"${protectedValue.replace(/"/g, '""')}"`;
}

export function exportCSV(state) {
  const valid = validateState(state);
  // Keep the original title/author text while protecting spreadsheet formulas.
  const rows = valid.books.map((book, index) => {
    const original = state.books[index];
    return [csvText(original.title), csvText(original.author ?? ''), book.totalPages, book.currentPage].join(',');
  });
  return `\uFEFF${[CSV_COLUMNS.join(','), ...rows].join('\r\n')}\r\n`;
}

function eventId(prefix, records, createdAt, otherRecords = []) {
  const base = `${prefix}-${new Date(createdAt).getTime().toString(36)}`;
  const used = new Set([...records, ...otherRecords].map((record) => record.id));
  let suffix = records.length + 1;
  let id = `${base}-${suffix}`;
  while (used.has(id)) id = `${base}-${++suffix}`;
  return id;
}

export function recordProgress(state, bookId, page, note = '', now = new Date()) {
  const valid = validateState(state);
  const index = valid.books.findIndex((book) => book.id === bookId);
  if (index < 0) throw new Error('没有找到这本书。');
  const book = valid.books[index];
  const currentPage = pageNumber(page, '当前页数');
  if (currentPage > book.totalPages) throw new Error('当前页数不能超过总页数。');
  if (typeof note !== 'string') throw new Error('笔记必须是文字。');
  if (note.length > MAX_NOTE_TEXT) throw new Error('笔记不能超过 5000 个字符。');
  const text = note.trim();
  if (!(now instanceof Date) && typeof now !== 'string' && typeof now !== 'number') {
    throw new Error('记录时间无效。');
  }
  const date = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new Error('记录时间无效。');
  if (typeof now === 'string') validISOTime(now);
  const createdAt = date.toISOString();
  validISOTime(createdAt);
  const books = valid.books.map((existing, position) => position === index ? { ...book, currentPage } : existing);
  const notes = valid.notes.slice();
  const sessions = valid.sessions.slice();

  if (currentPage > book.currentPage) {
    sessions.push({
      id: eventId('session', sessions, createdAt, [...books, ...notes]), bookId: book.id,
      fromPage: book.currentPage, toPage: currentPage,
      pages: currentPage - book.currentPage, createdAt,
    });
  }
  if (text) {
    notes.push({ id: eventId('note', notes, createdAt, [...books, ...sessions]), bookId: book.id, text, page: currentPage, createdAt });
  }
  return { ...state, ...valid, books, notes, sessions };
}
