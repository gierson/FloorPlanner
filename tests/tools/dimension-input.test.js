// ═══════════════════════════════════════════════════════════════
//  DimensionInput — Unit Tests
// ═══════════════════════════════════════════════════════════════

describe('DimensionInput.parse — bare numbers (mm)', () => {
  it('parses "4500" as 4500 mm', () => {
    assert.equal(DimensionInput.parse('4500'), 4500);
  });

  it('parses "0" as 0', () => {
    assert.equal(DimensionInput.parse('0'), 0);
  });

  it('parses "123.7" → rounds to 124', () => {
    assert.equal(DimensionInput.parse('123.7'), 124);
  });

  it('parses number type directly', () => {
    assert.equal(DimensionInput.parse(3000), 3000);
  });
});

describe('DimensionInput.parse — with units', () => {
  it('parses "4500mm" as 4500', () => {
    assert.equal(DimensionInput.parse('4500mm'), 4500);
  });

  it('parses "450cm" as 4500', () => {
    assert.equal(DimensionInput.parse('450cm'), 4500);
  });

  it('parses "4.5m" as 4500', () => {
    assert.equal(DimensionInput.parse('4.5m'), 4500);
  });

  it('parses "4m50cm" as 4500', () => {
    assert.equal(DimensionInput.parse('4m50cm'), 4500);
  });

  it('parses "4m 50" as 4500 (trailing number = cm)', () => {
    assert.equal(DimensionInput.parse('4m 50'), 4500);
  });

  it('parses "3m" as 3000', () => {
    assert.equal(DimensionInput.parse('3m'), 3000);
  });

  it('parses "150cm" as 1500', () => {
    assert.equal(DimensionInput.parse('150cm'), 1500);
  });
});

describe('DimensionInput.parse — edge cases', () => {
  it('returns null for empty string', () => {
    assert.equal(DimensionInput.parse(''), null);
  });

  it('returns null for whitespace', () => {
    assert.equal(DimensionInput.parse('   '), null);
  });

  it('returns null for non-numeric text', () => {
    assert.equal(DimensionInput.parse('abc'), null);
  });

  it('handles comma as decimal separator', () => {
    assert.equal(DimensionInput.parse('4,5m'), 4500);
  });

  it('trims whitespace', () => {
    assert.equal(DimensionInput.parse('  3000  '), 3000);
  });
});

describe('DimensionInput.validate', () => {
  it('valid for normal value', () => {
    const result = DimensionInput.validate(3000);
    assert.ok(result.valid);
  });

  it('invalid for null', () => {
    const result = DimensionInput.validate(null);
    assert.notOk(result.valid);
  });

  it('invalid for NaN', () => {
    const result = DimensionInput.validate(NaN);
    assert.notOk(result.valid);
  });

  it('invalid below min', () => {
    const result = DimensionInput.validate(0, 1);
    assert.notOk(result.valid);
  });

  it('invalid above max', () => {
    const result = DimensionInput.validate(200000, 1, 100000);
    assert.notOk(result.valid);
  });

  it('valid at exact min', () => {
    const result = DimensionInput.validate(50, 50);
    assert.ok(result.valid);
  });
});

describe('DimensionInput.format', () => {
  it('formats small values as mm', () => {
    assert.equal(DimensionInput.format(50, 'mm'), '50 mm');
  });

  it('formats medium values as cm in auto mode', () => {
    assert.equal(DimensionInput.format(1500, 'auto'), '150 cm');
  });

  it('formats large values as meters in auto mode', () => {
    assert.equal(DimensionInput.format(12000, 'auto'), '12 m');
  });

  it('formats 4500mm as "450 cm" in auto (under 10000 threshold)', () => {
    assert.equal(DimensionInput.format(4500, 'auto'), '450 cm');
  });

  it('formats 12500mm as "12 m 50 cm" in auto (over 10000 threshold)', () => {
    assert.equal(DimensionInput.format(12500, 'auto'), '12 m 50 cm');
  });
});
