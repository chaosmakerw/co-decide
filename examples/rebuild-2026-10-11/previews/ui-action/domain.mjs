const CSV_COLUMNS = ['title', 'author', 'total_pages', 'current_page'];

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
  const title = book.title.trim();
  const author = (book.author ?? '').trim();
  const totalPages = pageNumber(book.totalPages === undefined ? book.total_pages : book.totalPages, '总页数', 1);
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
  const normalizedBooks = books.map((book) => {
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

function eventId(prefix, records, createdAt) {
  const base = `${prefix}-${new Date(createdAt).getTime().toString(36)}`;
  const used = new Set(records.map((record) => record.id));
  let suffix = records.length + 1;
  let id = `${base}-${suffix}`;
  while (used.has(id)) id = `${base}-${++suffix}`;
  return id;
}

export function recordProgress(state, bookId, page, note = '', now = new Date()) {
  if (!state || state.version !== 1 || !Array.isArray(state.books) || !Array.isArray(state.notes) || !Array.isArray(state.sessions)) {
    throw new Error('阅读数据格式无效。');
  }
  const index = state.books.findIndex((book) => book.id === bookId);
  if (index < 0) throw new Error('没有找到这本书。');
  const book = validateBook(state.books[index]);
  const currentPage = pageNumber(page, '当前页数');
  if (currentPage > book.totalPages) throw new Error('当前页数不能超过总页数。');
  if (typeof note !== 'string') throw new Error('笔记必须是文字。');
  const text = note.trim();
  if (!(now instanceof Date) && typeof now !== 'string' && typeof now !== 'number') {
    throw new Error('记录时间无效。');
  }
  const date = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new Error('记录时间无效。');
  const createdAt = date.toISOString();
  const books = state.books.map((existing, position) => position === index ? { ...book, currentPage } : existing);
  const notes = state.notes.slice();
  const sessions = state.sessions.slice();

  if (currentPage > book.currentPage) {
    sessions.push({
      id: eventId('session', sessions, createdAt), bookId: book.id,
      fromPage: book.currentPage, toPage: currentPage,
      pages: currentPage - book.currentPage, createdAt,
    });
  }
  if (text) {
    notes.push({ id: eventId('note', notes, createdAt), bookId: book.id, text, page: currentPage, createdAt });
  }
  return { ...state, books, notes, sessions };
}
