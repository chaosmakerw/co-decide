(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.ReadingData = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STORAGE_KEY = "yejian-books-v1";
  var MAX_BOOKS = 2000;
  var MAX_NOTES = 1000;
  var MAX_INPUT_LENGTH = 8000000;
  var sequence = 0;
  var bookFields = ["id", "title", "author", "totalPages", "currentPage", "status", "notes", "addedAt", "updatedAt"];
  var noteFields = ["id", "text", "page", "createdAt"];

  function fail(message) {
    throw new Error(message);
  }

  function record(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      fail(label + "必须是对象。");
    }
  }

  function exactFields(value, fields, label) {
    fields.forEach(function (field) {
      if (!Object.prototype.hasOwnProperty.call(value, field)) {
        fail(label + "缺少字段 " + field + "。");
      }
    });
    Object.keys(value).forEach(function (field) {
      if (fields.indexOf(field) === -1) fail(label + "含未知字段 " + field + "。");
    });
  }

  function newId() {
    if (typeof globalThis !== "undefined" && globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
    sequence += 1;
    return "book-" + Date.now().toString(36) + "-" + sequence.toString(36) + "-" + Math.random().toString(36).slice(2, 12);
  }

  function identifier(value, label) {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) {
      fail(label + "必须是 1–100 个字母、数字、横线或下划线。");
    }
    return value;
  }

  function content(value, label, max) {
    if (typeof value !== "string") fail(label + "必须是文字。");
    var trimmed = value.trim();
    if (!trimmed || trimmed.length > max) fail(label + "须为 1–" + max + " 个字符。");
    return trimmed;
  }

  function integer(value, label, min, max) {
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      fail(label + "须为 " + min + "–" + max + " 之间的整数。");
    }
    return value;
  }

  function timestamp(value, label) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
      fail(label + "须为标准 ISO 日期。");
    }
    var date = new Date(value);
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
      fail(label + "不是有效日期。");
    }
    return value;
  }

  function statusFor(currentPage, totalPages) {
    return currentPage === 0 ? "want" : currentPage === totalPages ? "done" : "reading";
  }

  function validateNote(note, totalPages, strict) {
    record(note, "摘记");
    if (strict) exactFields(note, noteFields, "摘记");
    return {
      id: identifier(note.id === undefined ? newId() : note.id, "摘记 ID"),
      text: content(note.text, "摘记", 4000),
      page: integer(note.page, "摘记页码", 0, totalPages),
      createdAt: timestamp(note.createdAt === undefined ? new Date().toISOString() : note.createdAt, "摘记日期")
    };
  }

  function validateBookInternal(book, strict) {
    record(book, "书目");
    if (strict) exactFields(book, bookFields, "书目");
    var totalPages = integer(book.totalPages, "总页数", 1, 1000000);
    var currentPage = integer(book.currentPage, "当前页码", 0, totalPages);
    var status = statusFor(currentPage, totalPages);
    if (strict && book.status !== status) fail("阅读状态与当前页码不一致。");
    var rawNotes = book.notes === undefined ? [] : book.notes;
    if (!Array.isArray(rawNotes) || rawNotes.length > MAX_NOTES) fail("摘记须为数组，每本书最多 " + MAX_NOTES + " 条。");
    var seenNotes = new Set();
    var notes = rawNotes.map(function (note) {
      var result = validateNote(note, totalPages, strict);
      if (seenNotes.has(result.id)) fail("同一本书的摘记 ID 不能重复。");
      seenNotes.add(result.id);
      return result;
    });
    var now = new Date().toISOString();
    var addedAt = timestamp(book.addedAt === undefined ? now : book.addedAt, "添加日期");
    return {
      id: identifier(book.id === undefined ? newId() : book.id, "书目 ID"),
      title: content(book.title, "书名", 160),
      author: content(book.author, "作者", 120),
      totalPages: totalPages,
      currentPage: currentPage,
      status: status,
      notes: notes,
      addedAt: addedAt,
      updatedAt: timestamp(book.updatedAt === undefined ? addedAt : book.updatedAt, "更新日期")
    };
  }

  function validateBook(book) {
    return validateBookInternal(book, false);
  }

  function normalizeInternal(books, strict) {
    if (!Array.isArray(books) || books.length > MAX_BOOKS) fail("书架须为数组，最多 " + MAX_BOOKS + " 本书。");
    var seen = new Set();
    return books.map(function (book, index) {
      try {
        var result = validateBookInternal(book, strict);
        if (seen.has(result.id)) fail("书目 ID 不能重复。");
        seen.add(result.id);
        return result;
      } catch (error) {
        fail("第 " + (index + 1) + " 本书：" + error.message);
      }
    });
  }

  function normalize(books) {
    return normalizeInternal(books, false);
  }

  function inputText(text, label) {
    if (typeof text !== "string") fail(label + "必须是文字文件。");
    if (text.length > MAX_INPUT_LENGTH) fail(label + "过大，文字内容最多 " + MAX_INPUT_LENGTH + " 个字符。");
    return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  }

  function csvRows(text) {
    var rows = [];
    var row = [];
    var field = "";
    var quoted = false;
    var closed = false;
    function endField() {
      row.push(field);
      field = "";
      closed = false;
    }
    function endRow() {
      endField();
      rows.push(row);
      row = [];
    }
    for (var i = 0; i < text.length; i += 1) {
      var character = text[i];
      if (quoted) {
        if (character === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            quoted = false;
            closed = true;
          }
        } else {
          field += character;
        }
      } else if (character === ",") {
        endField();
      } else if (character === "\r" || character === "\n") {
        endRow();
        if (character === "\r" && text[i + 1] === "\n") i += 1;
      } else if (closed) {
        if (character !== " " && character !== "\t") fail("CSV 引号结束后出现多余文字。");
      } else if (character === '"') {
        if (field !== "") fail("CSV 引号必须出现在字段开头。");
        quoted = true;
      } else {
        field += character;
      }
    }
    if (quoted) fail("CSV 有未闭合的引号。");
    if (field !== "" || closed || row.length > 0) endRow();
    return rows;
  }

  function csvInteger(value, label) {
    var trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) fail(label + "须为非负整数。");
    var number = Number(trimmed);
    if (!Number.isSafeInteger(number)) fail(label + "超出整数范围。");
    return number;
  }

  function parseCSV(text) {
    var rows = csvRows(inputText(text, "CSV"));
    while (rows.length && rows[0].every(function (cell) { return !cell.trim(); })) rows.shift();
    if (!rows.length) fail("CSV 为空，缺少表头。");
    var headers = rows[0].map(function (value) { return value.trim().toLowerCase(); });
    var seen = new Set();
    headers.forEach(function (header) {
      if (!header) fail("CSV 表头不能留空。");
      if (seen.has(header)) fail("CSV 表头重复：" + header + "。");
      seen.add(header);
    });
    ["title", "author", "total_pages", "current_page"].forEach(function (header) {
      if (!seen.has(header)) fail("CSV 缺少表头 " + header + "。");
    });
    var indexes = Object.create(null);
    headers.forEach(function (header, index) { indexes[header] = index; });
    var books = [];
    rows.slice(1).forEach(function (row, index) {
      if (row.every(function (cell) { return !cell.trim(); })) return;
      try {
        if (row.length !== headers.length) fail("字段数量与表头不一致。");
        books.push(validateBook({
          title: row[indexes.title],
          author: row[indexes.author],
          totalPages: csvInteger(row[indexes.total_pages], "总页数"),
          currentPage: csvInteger(row[indexes.current_page], "当前页码")
        }));
        if (books.length > MAX_BOOKS) fail("最多导入 " + MAX_BOOKS + " 本书。");
      } catch (error) {
        fail("CSV 第 " + (index + 2) + " 行：" + error.message);
      }
    });
    return books;
  }

  function parseBackup(text) {
    var parsed;
    try {
      parsed = JSON.parse(inputText(text, "JSON 备份"));
    } catch (error) {
      if (error instanceof SyntaxError) fail("JSON 备份格式错误，无法解析。");
      throw error;
    }
    record(parsed, "JSON 备份");
    exactFields(parsed, ["version", "books"], "JSON 备份");
    if (parsed.version !== 1) fail("不支持该备份版本，目前仅支持 version 1。");
    return normalizeInternal(parsed.books, true);
  }

  function exportBackup(books) {
    var result = JSON.stringify({ version: 1, books: normalize(books) }, null, 2);
    if (result.length > MAX_INPUT_LENGTH) fail("书架备份过大，无法可靠保存。请减少摘记内容后重试。");
    return result;
  }

  var seedTimestamp = new Date().toISOString();
  var initialSeeds = normalize([
    { id: "seed-mountain", title: "山间来信", author: "顾禾", totalPages: 240, currentPage: 36, addedAt: seedTimestamp },
    { id: "seed-city", title: "城市慢步", author: "林遥", totalPages: 180, currentPage: 0, addedAt: seedTimestamp },
    { id: "seed-evening", title: "晚风笔记", author: "许川", totalPages: 120, currentPage: 120, addedAt: seedTimestamp }
  ]);

  function seedCopy() {
    return normalize(initialSeeds);
  }

  function createStore(storage, options) {
    options = options || {};
    var key = options.key === undefined ? STORAGE_KEY : options.key;
    if (typeof key !== "string" || !key.trim()) fail("本地保存键不能为空。");
    return {
      load: function () {
        var raw;
        try {
          if (!storage || typeof storage.getItem !== "function") fail("本地存储不可用。");
          raw = storage.getItem(key);
        } catch (error) {
          return { books: seedCopy(), error: "无法读取本地书架，当前显示示例书目；可导出 JSON 保留本次内容。" };
        }
        if (raw === null || raw === undefined) return { books: seedCopy(), error: null };
        try {
          return { books: parseBackup(raw), error: null };
        } catch (error) {
          return { books: seedCopy(), error: "本地书架数据已损坏，当前显示示例书目；原数据未改动。" + error.message };
        }
      },
      save: function (books) {
        var serialized;
        try {
          serialized = exportBackup(books);
        } catch (error) {
          return { ok: false, error: "书目未保存：" + error.message };
        }
        try {
          if (!storage || typeof storage.setItem !== "function") fail("本地存储不可用。");
          storage.setItem(key, serialized);
          return { ok: true, error: null };
        } catch (error) {
          return { ok: false, error: "本地保存失败，可能是浏览器限制或存储空间不足。请导出 JSON 备份保留本次内容。" };
        }
      }
    };
  }

  return {
    seeds: seedCopy(),
    createStore: createStore,
    validateBook: validateBook,
    normalize: normalize,
    parseCSV: parseCSV,
    parseBackup: parseBackup,
    exportBackup: exportBackup
  };
});
