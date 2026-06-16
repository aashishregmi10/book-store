'use strict';

const { detectOrigin, scoreConfidence } = require('../src/utils/bookOrigin');

describe('detectOrigin', () => {
  it('flags Nepal from the 978-9937 ISBN group', () => {
    const r = detectOrigin({ isbn13: '9789937123456' });
    expect(r.origin).toBe('nepal');
    expect(r.market).toBe('domestic');
    expect(r.currency).toBe('NPR');
    expect(r.nepaliDetected).toBe(true);
    expect(r.signals).toContain('isbn_nepal_9937');
  });

  it('flags India from the 978-81 / 978-93 groups', () => {
    expect(detectOrigin({ isbn13: '9788123456789' }).origin).toBe('india');
    const r = detectOrigin({ isbn13: '9789312345678' });
    expect(r.origin).toBe('india');
    expect(r.currency).toBe('INR');
  });

  it('flags Nepal from a known publisher even with a foreign-looking ISBN', () => {
    const r = detectOrigin({ isbn13: '9780000000000', publisher: 'Sajha Prakashan, Kathmandu' });
    expect(r.origin).toBe('nepal');
    expect(r.signals).toContain('publisher_nepal');
  });

  it('treats an international ISBN with no Nepali signal as imported/USD', () => {
    const r = detectOrigin({ isbn13: '9780735211292', publisher: 'Avery', author: 'James Clear' });
    expect(r.origin).toBe('international');
    expect(r.currency).toBe('USD');
    expect(r.nepaliDetected).toBe(false);
  });

  it('uses Devanagari and surname only as weak fallbacks (and records them)', () => {
    const dev = detectOrigin({ title: 'मुना मादन' });
    expect(dev.origin).toBe('nepal');
    expect(dev.signals).toContain('devanagari');

    const sur = detectOrigin({ author: 'Krishna Dharabasi Ghimire' });
    expect(sur.origin).toBe('nepal');
    expect(sur.signals).toContain('surname_ghimire');
  });

  it('does not let a weak surname override a strong India ISBN', () => {
    const r = detectOrigin({ isbn13: '9788123456789', author: 'Anil Sharma' });
    expect(r.origin).toBe('india');
  });
});

describe('scoreConfidence', () => {
  it('scores by which identifiers were supplied', () => {
    expect(scoreConfidence({ isbn: '9780735211292' })).toBe(1.0);
    expect(scoreConfidence({ title: 'X', author: 'Y' })).toBe(0.85);
    expect(scoreConfidence({ title: 'X', publisher: 'Z' })).toBe(0.75);
    expect(scoreConfidence({ title: 'X' })).toBe(0.6);
    expect(scoreConfidence({ author: 'Y' })).toBe(0.4);
    expect(scoreConfidence({ publisher: 'Z' })).toBe(0.2);
  });

  it('is 0 when nothing was found', () => {
    expect(scoreConfidence({ isbn: '9780735211292' }, false)).toBe(0);
  });
});
