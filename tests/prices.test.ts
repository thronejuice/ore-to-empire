import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DAILY, GEM_ITEMS, PACKS } from '../src/config/meta';
import { PACKS as SERVER_PACKS } from '../supabase/functions/_shared/packs';

describe('client and server price lists agree', () => {
  it('gem packs', () => {
    for (const [id, p] of Object.entries(PACKS)) {
      const srv = SERVER_PACKS[id];
      expect(srv, id).toBeDefined();
      expect(srv.gems).toBe(p.gems);
      expect(srv.satang).toBe(p.priceThb * 100);
      expect(srv.boostHours).toBe(p.boostHours ?? 0);
      expect(srv.oncePerAccount).toBe(!!p.oncePerAccount);
    }
    expect(Object.keys(SERVER_PACKS).sort()).toEqual(Object.keys(PACKS).sort());
  });

  it('gem items and daily rewards in the SQL functions', () => {
    const sql = readFileSync('supabase/migrations/20261006000000_init.sql', 'utf8');
    for (const [id, item] of Object.entries(GEM_ITEMS)) expect(sql).toContain(`when '${id}' then ${item.gems}`);
    expect(sql).toContain(`when p_key = '__bonus' then ${DAILY.gemsBonus} else ${DAILY.gemsEach}`);
    expect(sql).toContain(`> ${DAILY.gemsEach * DAILY.count + DAILY.gemsBonus}`);
  });
});
