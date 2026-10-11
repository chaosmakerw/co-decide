const MAX_BOOKS = 5000;
const MAX_NOTES = 20000;
const MAX_SESSIONS = 50000;
const MAX_NOTE_CHARACTERS = 2000000;
const BOOK_FIELDS = ['title', 'author', 'totalPages', 'currentPage', 'category', 'cover'];
const BOOK_STORAGE_FIELDS = [...BOOK_FIELDS, 'id', 'addedAt', 'finishedAt'];
let fallbackIdCounter = 0;

export const INITIAL_BOOKS = Object.freeze([
  Object.freeze({ id: 'seed-1', title: '山间来信', author: '顾禾', totalPages: 240, currentPage: 36, category: '散文', cover: 'mountain', addedAt: '2026-10-01T08:00:00.000Z' }),
  Object.freeze({ id: 'seed-2', title: '城市慢步', author: '林遥', totalPages: 180, currentPage: 0, category: '生活', cover: 'city', addedAt: '2026-10-02T08:00:00.000Z' }),
  Object.freeze({ id: 'seed-3', title: '晚风笔记', author: '许川', totalPages: 120, currentPage: 120, category: '随笔', cover: 'wind', addedAt: '2026-10-03T08:00:00.000Z' }),
]);

export function createInitialState() {
  return { version: 1, books: INITIAL_BOOKS.map((book) => ({ ...book })), notes: [], sessions: [], goal: 12 };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function requireObject(value, message) {
  if (!isObject(value)) throw new Error(message);
}

function allowedFields(value, fields, message) {
  if (Object.keys(value).some((key) => !fields.includes(key))) throw new Error(message);
}

function textValue(value, label, maxLength, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string') throw new Error(`${label}必须填写文字。`);
  const result = value.trim();
  if (!result) throw new Error(`${label}不能为空。`);
  if (result.length > maxLength) throw new Error(`${label}不能超过 ${maxLength} 个字符。`);
  if (/\u0000/.test(result)) throw new Error(`${label}不能包含无效字符。`);
  return result;
}

function integerValue(value, label, min, max, strictNumber = false) {
  if (strictNumber && typeof value !== 'number') throw new Error(`${label}必须是整数。`);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) throw new Error(`${label}必须是整数。`);
    value = Number(trimmed);
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${label}必须是 ${min} 到 ${max} 之间的整数。`);
  }
  return value;
}

function idValue(value, label = '编号') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(value)) {
    throw new Error(`${label}格式无效。`);
  }
  return value;
}

function dateValue(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(`${label}必须是有效的 ISO 日期。`);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new Error(`${label}无效。`);
  return value;
}

function newId(prefix) {
  const random = globalThis.crypto?.randomUUID?.();
  return random ? `${prefix}-${random}` : `${prefix}-${Date.now().toString(36)}-${(++fallbackIdCounter).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function requireState(state) {
  requireObject(state, '阅读数据格式无效。');
  if (state.version !== 1 || !Array.isArray(state.books) || !Array.isArray(state.notes) || !Array.isArray(state.sessions)) {
    throw new Error('阅读数据格式无效。');
  }
}

function findBook(state, id) {
  requireState(state);
  idValue(id, '书籍编号');
  const book = state.books.find((item) => item.id === id);
  if (!book) throw new Error('这本书已不存在，请刷新后重试。');
  return book;
}

function checkNoteSize(state, content, replacedId) {
  const total = state.notes.reduce((sum, note) => sum + (note.id === replacedId ? 0 : note.content.length), content.length);
  if (total > MAX_NOTE_CHARACTERS) throw new Error('笔记内容总量过大，请先导出备份并整理旧笔记。');
}

export function getBookStatus(book) {
  if (book.currentPage >= book.totalPages) return 'finished';
  return book.currentPage === 0 ? 'unread' : 'reading';
}

export function validateBook(input) {
  requireObject(input, '请填写有效的书籍信息。');
  const title = textValue(input.title, '书名', 120);
  const author = textValue(input.author, '作者', 120);
  const totalPages = integerValue(input.totalPages, '总页数', 1, 100000);
  const currentPage = integerValue(input.currentPage, '当前页码', 0, totalPages);
  const category = textValue(input.category, '分类', 40, '其他');
  const cover = textValue(input.cover, '封面', 40, 'mountain');
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(cover)) throw new Error('封面样式无效。');
  return { title, author, totalPages, currentPage, category, cover };
}

export function addBook(state, input) {
  requireState(state);
  requireObject(input, '请填写有效的书籍信息。');
  allowedFields(input, BOOK_FIELDS, '书籍信息包含不支持的字段。');
  if (state.books.length >= MAX_BOOKS) throw new Error(`书架最多可保存 ${MAX_BOOKS} 本书。`);
  const normalized = validateBook(input);
  if (state.books.some((book) => bookKey(book) === bookKey(normalized))) throw new Error('书架中已存在同名、同作者的书。');
  const book = { id: newId('book'), ...normalized, addedAt: new Date().toISOString() };
  return { ...state, books: [...state.books, book] };
}

export function updateBook(state, id, patch) {
  const oldBook = findBook(state, id);
  requireObject(patch, '书籍修改内容无效。');
  allowedFields(patch, BOOK_FIELDS, '只能修改书名、作者、页码、分类和封面。');
  const book = { ...oldBook, ...validateBook({ ...oldBook, ...patch }) };
  if (state.books.some((item) => item.id !== id && bookKey(item) === bookKey(book))) throw new Error('书架中已存在同名、同作者的书。');
  if (state.notes.some((note) => note.bookId === id && note.page > book.totalPages)) {
    throw new Error('已有笔记的页码超过新的总页数，请先调整对应笔记。');
  }
  if (state.sessions.some((session) => session.bookId === id && session.pages > book.totalPages)) {
    throw new Error('已有阅读记录的页数超过新的总页数，不能缩减到这个页数。');
  }
  if (getBookStatus(book) !== 'finished') delete book.finishedAt;
  else if (getBookStatus(oldBook) !== 'finished') book.finishedAt = new Date().toISOString();
  return { ...state, books: state.books.map((item) => item.id === id ? book : item) };
}

export function removeBook(state, id) {
  findBook(state, id);
  return {
    ...state,
    books: state.books.filter((book) => book.id !== id),
    notes: state.notes.filter((note) => note.bookId !== id),
    sessions: state.sessions.filter((session) => session.bookId !== id),
  };
}

export function saveNote(state, input) {
  requireObject(input, '笔记内容无效。');
  allowedFields(input, ['id', 'bookId', 'page', 'content'], '笔记包含不支持的字段。');
  const book = findBook(state, input.bookId);
  const page = integerValue(input.page, '笔记页码', 0, book.totalPages);
  const content = textValue(input.content, '笔记', 10000);
  let previous;
  if (input.id !== undefined) {
    idValue(input.id, '笔记编号');
    previous = state.notes.find((note) => note.id === input.id);
    if (!previous) throw new Error('这条笔记已不存在。');
    if (previous.bookId !== book.id) throw new Error('不能修改笔记所属的书籍。');
  } else if (state.notes.length >= MAX_NOTES) {
    throw new Error(`最多可保存 ${MAX_NOTES} 条笔记。`);
  }
  checkNoteSize(state, content, previous?.id);
  const now = new Date().toISOString();
  const note = { id: previous?.id ?? newId('note'), bookId: book.id, page, content, createdAt: previous?.createdAt ?? now, updatedAt: now };
  return { ...state, notes: previous ? state.notes.map((item) => item.id === note.id ? note : item) : [...state.notes, note] };
}

export function deleteNote(state, id) {
  requireState(state);
  idValue(id, '笔记编号');
  if (!state.notes.some((note) => note.id === id)) throw new Error('这条笔记已不存在。');
  return { ...state, notes: state.notes.filter((note) => note.id !== id) };
}

export function recordReading(state, input) {
  requireObject(input, '阅读记录无效。');
  allowedFields(input, ['bookId', 'currentPage', 'minutes', 'note'], '阅读记录包含不支持的字段。');
  const book = findBook(state, input.bookId);
  const currentPage = integerValue(input.currentPage, '读到的页码', book.currentPage, book.totalPages);
  const minutes = integerValue(input.minutes, '阅读时长', 1, 1440);
  if (state.sessions.length >= MAX_SESSIONS) throw new Error(`最多可保存 ${MAX_SESSIONS} 条阅读记录。`);
  let content;
  if (input.note !== undefined) {
    if (typeof input.note !== 'string') throw new Error('阅读笔记必须填写文字。');
    if (input.note.trim()) content = textValue(input.note, '阅读笔记', 10000);
  }
  if (content && state.notes.length >= MAX_NOTES) throw new Error(`最多可保存 ${MAX_NOTES} 条笔记。`);
  if (content) checkNoteSize(state, content);
  const date = new Date().toISOString();
  const nextBook = { ...book, currentPage };
  if (currentPage === book.totalPages && book.currentPage < book.totalPages) nextBook.finishedAt = date;
  const session = { id: newId('session'), bookId: book.id, date, minutes, pages: currentPage - book.currentPage };
  const result = { ...state, books: state.books.map((item) => item.id === book.id ? nextBook : item), sessions: [...state.sessions, session] };
  if (content) {
    result.notes = [...state.notes, { id: newId('note'), bookId: book.id, page: currentPage, content, createdAt: date, updatedAt: date }];
  }
  return result;
}

export function setGoal(state, goal) {
  requireState(state);
  return { ...state, goal: integerValue(goal, '阅读目标', 1, 1000) };
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let closedQuote = false;
  function finishField() {
    row.push(field);
    field = '';
    closedQuote = false;
  }
  function finishRow() {
    finishField();
    if (!(row.length === 1 && row[0] === '')) rows.push(row);
    row = [];
    if (rows.length > MAX_BOOKS + 1) throw new Error(`一次最多导入 ${MAX_BOOKS} 本书。`);
  }
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          inQuotes = false;
          closedQuote = true;
        }
      } else field += char;
      continue;
    }
    if (closedQuote && char !== ',' && char !== '\r' && char !== '\n') throw new Error('CSV 引号后只能出现逗号或换行。');
    if (char === '"') {
      if (field !== '') throw new Error('CSV 引号必须从字段开头开始。');
      inQuotes = true;
    } else if (char === ',') finishField();
    else if (char === '\r' || char === '\n') {
      finishRow();
      if (char === '\r' && text[index + 1] === '\n') index++;
    } else field += char;
  }
  if (inQuotes) throw new Error('CSV 中有未闭合的双引号。');
  if (field !== '' || row.length > 0 || closedQuote) finishRow();
  return rows;
}

export function parseBooksCsv(text) {
  if (typeof text !== 'string') throw new Error('请选择有效的 CSV 文件。');
  if (text.length > 10000000) throw new Error('CSV 文件过大，请使用 10 MB 以内的文件。');
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ''));
  if (!rows.length) throw new Error('CSV 文件为空。');
  const headers = rows[0].map((header) => header.trim());
  const required = ['title', 'author', 'total_pages', 'current_page'];
  const indexes = required.map((header) => headers.indexOf(header));
  if (indexes.some((index) => index === -1) || required.some((header) => headers.filter((item) => item === header).length !== 1)) {
    throw new Error('CSV 表头需要 title,author,total_pages,current_page，且每项只能出现一次。');
  }
  return rows.slice(1).map((row, index) => {
    try {
      if (row.length !== headers.length) throw new Error('字段数量与表头不一致。');
      return validateBook({ title: row[indexes[0]], author: row[indexes[1]], totalPages: row[indexes[2]], currentPage: row[indexes[3]] });
    } catch (error) {
      throw new Error(`CSV 第 ${index + 2} 行：${error.message}`);
    }
  });
}

function bookKey(book) {
  return JSON.stringify([book.title, book.author]);
}

export function mergeImportedBooks(state, books) {
  requireState(state);
  if (!Array.isArray(books) || books.length > MAX_BOOKS) throw new Error(`导入数据必须是最多 ${MAX_BOOKS} 本书的列表。`);
  const normalized = books.map(validateBook);
  const known = new Set(state.books.map(bookKey));
  const addedAt = new Date().toISOString();
  const added = [];
  for (const book of normalized) {
    const key = bookKey(book);
    if (known.has(key)) continue;
    known.add(key);
    added.push({ id: newId('book'), ...book, addedAt });
  }
  if (state.books.length + added.length > MAX_BOOKS) throw new Error(`书架最多可保存 ${MAX_BOOKS} 本书。`);
  return { ...state, books: [...state.books, ...added] };
}

function csvCell(value) {
  let text = String(value);
  if (/^[=+\-@\t\r\n]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toBooksCsv(state) {
  requireState(state);
  const lines = ['title,author,total_pages,current_page'];
  for (const item of state.books) {
    const book = validateBook(item);
    lines.push([book.title, book.author, book.totalPages, book.currentPage].map(csvCell).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

export function validateState(raw) {
  requireObject(raw, '阅读数据必须是一个对象。');
  allowedFields(raw, ['version', 'books', 'notes', 'sessions', 'goal'], '阅读数据包含不支持的字段。');
  if (raw.version !== 1) throw new Error('不支持这个数据版本。');
  for (const [key, limit] of [['books', MAX_BOOKS], ['notes', MAX_NOTES], ['sessions', MAX_SESSIONS]]) {
    if (!Array.isArray(raw[key]) || raw[key].length > limit) throw new Error(`${key} 数据格式或数量无效。`);
  }
  const goal = integerValue(raw.goal, '阅读目标', 1, 1000, true);
  const seenIds = new Set();
  const seenBooks = new Set();
  function uniqueId(value, label) {
    const id = idValue(value, label);
    if (seenIds.has(id)) throw new Error('阅读数据中存在重复的编号。');
    seenIds.add(id);
    return id;
  }
  const books = raw.books.map((item) => {
    requireObject(item, '书籍数据格式无效。');
    allowedFields(item, BOOK_STORAGE_FIELDS, '书籍数据包含不支持的字段。');
    integerValue(item.totalPages, '总页数', 1, 100000, true);
    integerValue(item.currentPage, '当前页码', 0, item.totalPages, true);
    if (typeof item.category !== 'string' || typeof item.cover !== 'string') throw new Error('书籍分类或封面缺失。');
    const book = { id: uniqueId(item.id, '书籍编号'), ...validateBook(item), addedAt: dateValue(item.addedAt, '添加时间') };
    const key = bookKey(book);
    if (seenBooks.has(key)) throw new Error('阅读数据中存在同名、同作者的重复书籍。');
    seenBooks.add(key);
    if (item.finishedAt !== undefined) {
      if (book.currentPage !== book.totalPages) throw new Error('未读完的书不能包含读完时间。');
      book.finishedAt = dateValue(item.finishedAt, '读完时间');
    }
    return book;
  });
  const bookMap = new Map(books.map((book) => [book.id, book]));
  let noteCharacters = 0;
  const notes = raw.notes.map((item) => {
    requireObject(item, '笔记数据格式无效。');
    allowedFields(item, ['id', 'bookId', 'page', 'content', 'createdAt', 'updatedAt'], '笔记数据包含不支持的字段。');
    const book = bookMap.get(idValue(item.bookId, '笔记关联书籍编号'));
    if (!book) throw new Error('笔记关联的书籍不存在。');
    const content = textValue(item.content, '笔记', 10000);
    noteCharacters += content.length;
    if (noteCharacters > MAX_NOTE_CHARACTERS) throw new Error('笔记内容总量过大。');
    const note = { id: uniqueId(item.id, '笔记编号'), bookId: book.id, page: integerValue(item.page, '笔记页码', 0, book.totalPages, true), content, createdAt: dateValue(item.createdAt, '笔记创建时间') };
    if (item.updatedAt !== undefined) note.updatedAt = dateValue(item.updatedAt, '笔记修改时间');
    return note;
  });
  const sessions = raw.sessions.map((item) => {
    requireObject(item, '阅读记录数据格式无效。');
    allowedFields(item, ['id', 'bookId', 'date', 'minutes', 'pages'], '阅读记录包含不支持的字段。');
    const bookId = idValue(item.bookId, '阅读记录关联书籍编号');
    const book = bookMap.get(bookId);
    if (!book) throw new Error('阅读记录关联的书籍不存在。');
    return { id: uniqueId(item.id, '阅读记录编号'), bookId, date: dateValue(item.date, '阅读时间'), minutes: integerValue(item.minutes, '阅读时长', 1, 1440, true), pages: integerValue(item.pages, '本次阅读页数', 0, book.totalPages, true) };
  });
  return { version: 1, books, notes, sessions, goal };
}
