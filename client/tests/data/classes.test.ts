import { describe, it, expect } from 'vitest';
import { CLASS_REGISTRY, CLASS_LIST, getClass } from '../../src/data/classes';

describe('ClassRegistry', () => {
  it('has 4 classes', () => {
    expect(CLASS_LIST).toHaveLength(4);
  });

  it('each class has 12 nodes', () => {
    for (const cls of CLASS_LIST) {
      expect(cls.nodes, cls.id).toHaveLength(12);
    }
  });

  it('each class has 4 tiers × 3 slots', () => {
    for (const cls of CLASS_LIST) {
      for (const tier of [1, 2, 3, 4] as const) {
        const nodes = cls.nodes.filter((n) => n.tier === tier);
        expect(nodes, `${cls.id} tier ${tier}`).toHaveLength(3);
        for (const slot of [1, 2, 3] as const) {
          expect(nodes.find((n) => n.slot === slot), `${cls.id} tier ${tier} slot ${slot}`).toBeDefined();
        }
      }
    }
  });

  it('node IDs are unique and match pattern', () => {
    const seen = new Set<string>();
    const pattern = /^(warrior|cleric|mage|thief)_t[1-4]_[1-3]$/;
    for (const cls of CLASS_LIST) {
      for (const node of cls.nodes) {
        expect(pattern.test(node.id), `bad id: ${node.id}`).toBe(true);
        expect(seen.has(node.id), `duplicate id: ${node.id}`).toBe(false);
        seen.add(node.id);
      }
    }
    expect(seen.size).toBe(48);
  });

  it('effect types are valid', () => {
    const validTypes = new Set(['attribute_mod', 'hp_max_bonus', 'mp_max_bonus', 'dodge_threshold_bonus', 'damage_modifier', 'exp_bonus', 'qte_tolerance']);
    for (const cls of CLASS_LIST) {
      for (const node of cls.nodes) {
        expect(validTypes.has(node.effect.type), `bad effect type: ${node.effect.type}`).toBe(true);
      }
    }
  });

  it('getClass returns class for valid id', () => {
    expect(getClass('warrior')?.id).toBe('warrior');
  });

  it('getClass returns null for invalid id', () => {
    expect(getClass('rogue')).toBeNull();
  });

  it('CLASS_REGISTRY has all 4 expected ids', () => {
    expect(Object.keys(CLASS_REGISTRY).sort()).toEqual(['cleric', 'mage', 'thief', 'warrior']);
  });
});
