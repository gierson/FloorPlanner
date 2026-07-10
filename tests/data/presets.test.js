// ═══════════════════════════════════════════════════════════════
//  Presets — herringbone presets & pattern filtering
// ═══════════════════════════════════════════════════════════════

describe('HERRINGBONE_PRESETS', () => {
  it('lista istnieje i nie jest pusta', () => {
    assert.ok(typeof HERRINGBONE_PRESETS !== 'undefined', 'HERRINGBONE_PRESETS powinno być zdefiniowane');
    assert.greaterThan(HERRINGBONE_PRESETS.length, 0, 'powinien istnieć co najmniej jeden preset jodełki');
  });

  it('zawiera preset 625 × 125 mm', () => {
    const p = HERRINGBONE_PRESETS.find(p => p.length === 625 && p.width === 125);
    assert.ok(p, 'powinien istnieć preset 625×125');
  });

  it('każdy preset ma proporcję długość/szerokość ≥ 3 (nadaje się do jodełki)', () => {
    for (const p of HERRINGBONE_PRESETS) {
      assert.greaterThan(p.length / p.width, 2.99,
        `preset ${p.name}: proporcja ${(p.length / p.width).toFixed(2)} za mała dla jodełki`);
    }
  });

  it('każdy preset ma kategorię, id, gap i stagger', () => {
    for (const p of HERRINGBONE_PRESETS) {
      assert.ok(p.id, 'preset musi mieć id');
      assert.equal(p.category, 'Jodełka', `preset ${p.id} powinien mieć kategorię "Jodełka"`);
      assert.ok(p.defaultGap > 0, `preset ${p.id} musi mieć defaultGap`);
      assert.ok(p.defaultStagger, `preset ${p.id} musi mieć defaultStagger`);
    }
  });
});

describe('getPresetsForPattern', () => {
  it('dla "herringbone" zwraca tylko presety jodełki (wbudowane)', () => {
    const presets = getPresetsForPattern('herringbone');
    const builtIn = presets.filter(p => !p.isCustom);
    assert.greaterThan(builtIn.length, 0, 'powinny być presety jodełki');
    for (const p of builtIn) {
      assert.equal(p.category, 'Jodełka', `preset ${p.id} nie jest presetem jodełki`);
    }
  });

  it('dla "straight" zwraca standardowe presety (bez jodełki)', () => {
    const presets = getPresetsForPattern('straight');
    const builtIn = presets.filter(p => !p.isCustom);
    assert.greaterThan(builtIn.length, 0, 'powinny być standardowe presety');
    for (const p of builtIn) {
      assert.notEqual(p.category, 'Jodełka', `preset ${p.id} jodełki nie powinien być na liście "straight"`);
    }
  });

  it('findPreset znajduje presety jodełki po id', () => {
    const hb = HERRINGBONE_PRESETS[0];
    const found = findPreset(hb.id);
    assert.ok(found, `findPreset('${hb.id}') powinno znaleźć preset jodełki`);
    assert.equal(found.length, hb.length);
  });
});
