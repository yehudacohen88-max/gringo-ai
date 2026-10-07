const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;

function resetGoogleSheetsModules() {
  for (const modulePath of ['../src/config/googleSheets', '../src/config/env']) {
    try {
      delete require.cache[require.resolve(modulePath)];
    } catch (error) {
      // Module may not have been loaded yet.
    }
  }
}

function loadGoogleSheetsWithFake(state) {
  resetGoogleSheetsModules();
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = 'test-spreadsheet';
  process.env.GOOGLE_SHEETS_CLIENT_EMAIL = 'test@example.com';
  process.env.GOOGLE_SHEETS_PRIVATE_KEY = 'test-private-key';

  Module._load = function load(request, parent, isMain) {
    if (request === 'googleapis') {
      return {
        google: {
          auth: {
            JWT: function JWT() {},
          },
          sheets: () => ({
            spreadsheets: {
              get: async () => ({
                data: {
                  sheets: Object.keys(state.rowsBySheet).map((title) => ({
                    properties: { title },
                  })),
                },
              }),
              batchUpdate: async (request) => {
                for (const item of request.requestBody.requests || []) {
                  const title = item.addSheet?.properties?.title;
                  if (title && !state.rowsBySheet[title]) state.rowsBySheet[title] = [];
                }
              },
              values: {
                get: async ({ range }) => {
                  state.reads[range] = (state.reads[range] || 0) + 1;
                  const sheetName = range.split('!')[0];
                  return { data: { values: state.rowsBySheet[sheetName] || [] } };
                },
                append: async ({ range, requestBody }) => {
                  const sheetName = range.split('!')[0];
                  state.rowsBySheet[sheetName] ||= [];
                  state.rowsBySheet[sheetName].push(...requestBody.values.map((row) => [...row]));
                },
                update: async ({ range, requestBody }) => {
                  const sheetName = range.split('!')[0];
                  const rowNumber = Number((range.match(/!A(\d+)/) || [])[1] || 1);
                  state.rowsBySheet[sheetName] ||= [];
                  state.rowsBySheet[sheetName][rowNumber - 1] = [...requestBody.values[0]];
                },
              },
            },
          }),
        },
      };
    }

    return originalLoad.apply(this, arguments);
  };

  return require('../src/config/googleSheets');
}

test.afterEach(() => {
  Module._load = originalLoad;
  resetGoogleSheetsModules();
});

test('repeated reads within TTL use cache', async () => {
  const state = {
    reads: {},
    rowsBySheet: {
      UserProfiles: [['userId'], ['usr_1']],
    },
  };
  const googleSheets = loadGoogleSheetsWithFake(state);

  assert.deepEqual(await googleSheets.readSheetRows('UserProfiles'), [['userId'], ['usr_1']]);
  assert.deepEqual(await googleSheets.readSheetRows('UserProfiles'), [['userId'], ['usr_1']]);

  assert.equal(state.reads['UserProfiles!A:ZZ'], 1);
});

test('writes invalidate cache', async () => {
  const state = {
    reads: {},
    rowsBySheet: {
      UserProfiles: [['userId'], ['usr_1']],
    },
  };
  const googleSheets = loadGoogleSheetsWithFake(state);

  await googleSheets.readSheetRows('UserProfiles');
  await googleSheets.appendSheetRow('UserProfiles', ['usr_2']);
  await googleSheets.readSheetRows('UserProfiles');

  assert.equal(state.reads['UserProfiles!A:ZZ'], 2);
});

test('read after write returns fresh data', async () => {
  const state = {
    reads: {},
    rowsBySheet: {
      UserProfiles: [['userId'], ['usr_1']],
    },
  };
  const googleSheets = loadGoogleSheetsWithFake(state);

  await googleSheets.readSheetRows('UserProfiles');
  await googleSheets.appendSheetRow('UserProfiles', ['usr_fresh']);
  const rows = await googleSheets.readSheetRows('UserProfiles');

  assert.deepEqual(rows, [['userId'], ['usr_1'], ['usr_fresh']]);
  assert.equal(state.reads['UserProfiles!A:ZZ'], 2);
});

test('different sheets do not share cached data', async () => {
  const state = {
    reads: {},
    rowsBySheet: {
      UserProfiles: [['userId'], ['usr_1']],
      ConversationHistory: [['conversationId'], ['conv_1']],
    },
  };
  const googleSheets = loadGoogleSheetsWithFake(state);

  assert.deepEqual(await googleSheets.readSheetRows('UserProfiles'), [['userId'], ['usr_1']]);
  assert.deepEqual(await googleSheets.readSheetRows('ConversationHistory'), [['conversationId'], ['conv_1']]);
  assert.deepEqual(await googleSheets.readSheetRows('UserProfiles'), [['userId'], ['usr_1']]);

  assert.equal(state.reads['UserProfiles!A:ZZ'], 1);
  assert.equal(state.reads['ConversationHistory!A:ZZ'], 1);
});

test('sheet initialization invalidates cached sheet data', async () => {
  const state = {
    reads: {},
    rowsBySheet: {
      UserProfiles: [['oldHeader']],
    },
  };
  const googleSheets = loadGoogleSheetsWithFake(state);

  await googleSheets.readSheetRows('UserProfiles');
  await googleSheets.ensureSheetWithHeader('UserProfiles', ['userId']);
  const rows = await googleSheets.readSheetRows('UserProfiles');

  assert.deepEqual(rows, [['userId']]);
  assert.equal(state.reads['UserProfiles!A:ZZ'], 2);
});
