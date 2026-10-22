'use strict';

const { lookupByIsbn, lookupBook } = require('../src/utils/bookLookup');

// Route every request by URL to a canned response. Anything unrouted is a 404,
// so a test fails loudly if the code calls something it was not meant to.
function mockFetch(routes) {
  const calls = [];
  global.fetch = jest.fn(async (url) => {
    calls.push(url);
    const hit = routes.find(([match]) => (typeof match === 'string' ? url.includes(match) : match.test(url)));
    const [, body, status = 200] = hit || [null, {}, 404];
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  });
  return calls;
}

const googleEmpty = { totalItems: 0 };
const vol = (o) => ({ volumeInfo: { language: 'en', ...o } });
const isbnQuery = /googleapis.*q=isbn%3A|googleapis.*q=isbn:/;
const plainQuery = /googleapis.*q=(?!isbn)/;

const realFetch = global.fetch;
afterAll(() => { global.fetch = realFetch; });

describe('lookupByIsbn — Google ISBN query still works', () => {
  it('returns the exact edition and skips Open Library when it is complete', async () => {
    const calls = mockFetch([
      [isbnQuery, { items: [vol({ title: 'Western Lane', authors: ['Chetna Maroo'], description: '<p>Eleven-year-old Gopi has played squash since she could hold a racket.</p>', publisher: 'Picador', industryIdentifiers: [{ type: 'ISBN_13', identifier: '9781529094626' }] })] }],
    ]);
    const m = await lookupByIsbn('9781529094626', { title: 'Western Lane', author: 'Chetna Maroo' });
    expect(m).toMatchObject({ match: 'isbn', source: 'google', author: 'Chetna Maroo', isbn13: '9781529094626' });
    expect(m.description).toBe('Eleven-year-old Gopi has played squash since she could hold a racket.'); // HTML stripped
    expect(calls.some((u) => u.includes('openlibrary'))).toBe(false);
  });
});

describe('lookupByIsbn — Google ISBN query returns nothing (Oct 2026)', () => {
  it('finds the same edition by words and treats it as exact', async () => {
    mockFetch([
      [isbnQuery, googleEmpty],
      [plainQuery, { items: [
        vol({ title: 'The Hobbit', authors: ['J.R.R. Tolkien'], description: 'Another printing.', industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780547928227' }] }),
        vol({ title: 'The Hobbit', authors: ['J.R.R. Tolkien'], description: 'This is the story of how a Baggins had an adventure.', publisher: 'HarperCollins', pageCount: 400, industryIdentifiers: [{ type: 'ISBN_10', identifier: '0261103342' }, { type: 'ISBN_13', identifier: '9780261103344' }] }),
      ] }],
    ]);
    const m = await lookupByIsbn('9780261103344', { title: 'The Hobbit', author: 'J.R.R. Tolkien' });
    expect(m).toMatchObject({ match: 'isbn', isbn13: '9780261103344', description: 'This is the story of how a Baggins had an adventure.' });
    expect(m.specifications.publisher).toBe('HarperCollins');
  });

  it('takes only work-level facts from a different printing, and edition facts from Open Library', async () => {
    mockFetch([
      [isbnQuery, googleEmpty],
      [plainQuery, { items: [vol({
        title: 'Blood Meridian', subtitle: 'Or the Evening Redness in the West', authors: ['Cormac McCarthy'],
        description: '25th ANNIVERSARY EDITION of the novel. Blood Meridian is an epic novel of the violence that attended westward expansion.',
        publisher: 'Vintage', pageCount: 351, imageLinks: { thumbnail: 'http://books.google/x' },
        industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780679728757' }],
      })] }],
      ['openlibrary.org/isbn/9780330510790', { title: 'Blood Meridian', publishers: ['Picador'], number_of_pages: 352, authors: [{ key: '/authors/OL1A' }], works: [{ key: '/works/OL1W' }] }],
      ['openlibrary.org/works/OL1W', { title: 'Blood Meridian' }],
      ['openlibrary.org/authors/OL1A', { name: 'Cormac McCarthy' }],
    ]);
    const m = await lookupByIsbn('9780330510790', { title: 'Blood Meridian', author: 'Cormac McCarthy' });
    // Description from Google, with the sentence selling another printing dropped.
    expect(m.description).toBe('Blood Meridian is an epic novel of the violence that attended westward expansion.');
    // Edition facts from the exact ISBN (Open Library), never from Google's other printing.
    expect(m).toMatchObject({ match: 'isbn', source: 'openlibrary' });
    expect(m.specifications).toMatchObject({ publisher: 'Picador', pages: 352 });
    expect(m.isbn13).not.toBe('9780679728757');
    expect(m.coverUrl).toBeUndefined();
  });

  it('rejects a candidate whose author does not agree', async () => {
    mockFetch([
      [isbnQuery, googleEmpty],
      [plainQuery, { items: [vol({ title: 'Fever Dream', authors: ['Dennis Palumbo'], description: 'A bank robbery goes wrong.' })] }],
    ]);
    const m = await lookupByIsbn('9780525541363', { title: 'Fever Dream', author: 'Samanta Schweblin' });
    expect(m).toBeNull();
  });

  it('rejects a candidate in another language', async () => {
    mockFetch([
      [isbnQuery, googleEmpty],
      [plainQuery, { items: [vol({ title: 'Ariel', authors: ['Sylvia Plath'], language: 'nl', description: 'Sylvia Plath een van de meest gewaardeerde dichters.' })] }],
    ]);
    expect(await lookupByIsbn('9780571086269', { title: 'Ariel', author: 'Sylvia Plath' })).toBeNull();
  });

  it('accepts nothing on title alone when the author is unknown', async () => {
    mockFetch([
      [isbnQuery, googleEmpty],
      [plainQuery, { items: [vol({ title: 'Picture Imperfect', authors: ['Jacqueline Wilson'], description: 'A story.' })] }],
    ]);
    expect(await lookupByIsbn('9789355418999', { title: 'Picture Imperfect', author: 'Unknown' })).toBeNull();
  });
});

describe('lookupByIsbn — Open Library exact edition', () => {
  it('resolves author keys to names and takes the work description, cleaned', async () => {
    mockFetch([
      [isbnQuery, googleEmpty],
      ['openlibrary.org/isbn/9781473637474', { title: 'Factfulness', publishers: ['Sceptre'], authors: [{ key: '/authors/A1' }, { key: '/authors/A2' }], works: [{ key: '/works/W1' }] }],
      ['openlibrary.org/works/W1', { description: { type: '/type/text', value: 'Ten reasons we are wrong about the [world](https://example.org).\n\n----------\nSee also: [1]' } }],
      ['openlibrary.org/authors/A1', { name: 'Hans Rosling' }],
      ['openlibrary.org/authors/A2', { name: 'Ola Rosling' }],
    ]);
    const m = await lookupByIsbn('9781473637474'); // no hints: Google is skipped after its ISBN query
    expect(m).toMatchObject({ match: 'isbn', source: 'openlibrary', author: 'Hans Rosling & Ola Rosling' });
    expect(m.description).toBe('Ten reasons we are wrong about the world.');
  });

  it('returns null when no provider knows the ISBN', async () => {
    mockFetch([[isbnQuery, googleEmpty]]);
    expect(await lookupByIsbn('9789999999999', { title: 'Nothing Here', author: 'Nobody' })).toBeNull();
  });
});

describe('Google rate limits', () => {
  const saved = { a: process.env.GOOGLE_BOOKS_API_KEY, b: process.env.GOOGLE_BOOKS_API_KEY_SPARE };
  afterEach(() => { process.env.GOOGLE_BOOKS_API_KEY = saved.a; process.env.GOOGLE_BOOKS_API_KEY_SPARE = saved.b; });

  it('moves to the spare key when the main key is rate-limited', async () => {
    process.env.GOOGLE_BOOKS_API_KEY = 'MAIN';
    process.env.GOOGLE_BOOKS_API_KEY_SPARE = 'SPARE';
    const calls = mockFetch([
      [/key=MAIN/, { error: { code: 429 } }, 429],
      [/q=isbn.*key=SPARE/, { items: [vol({ title: 'Quit', authors: ['Annie Duke'], description: 'When to walk away.', industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780593422991' }] })] }],
    ]);
    const m = await lookupByIsbn('9780593422991');
    expect(m).toMatchObject({ source: 'google', match: 'isbn', author: 'Annie Duke' });
    expect(calls.filter((u) => u.includes('googleapis')).map((u) => u.match(/key=(\w+)/)[1])).toEqual(['MAIN', 'SPARE']);
  });
});

describe('lookupBook — title search', () => {
  it('prefers a verified Google hit with a blurb', async () => {
    mockFetch([
      [plainQuery, { items: [
        vol({ title: 'Blood Meridian Revisited', authors: ['Someone Else'], description: 'Criticism.' }),
        vol({ title: 'Blood Meridian', authors: ['Cormac McCarthy'], description: 'An epic novel of the American West.' }),
      ] }],
    ]);
    const m = await lookupBook({ title: 'Blood Meridian', author: 'Cormac McCarthy' });
    expect(m).toMatchObject({ source: 'google', title: 'Blood Meridian', description: 'An epic novel of the American West.' });
  });
});
