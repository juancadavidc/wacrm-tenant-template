import { describe, expect, it } from 'vitest';
import { MARCA_SUPERADMIN, esSuperadmin } from './marca-superadmin';

describe('esSuperadmin', () => {
  it('solo app_metadata.wacrm_superadmin === true', () => {
    expect(MARCA_SUPERADMIN).toBe('wacrm_superadmin');
    expect(esSuperadmin({ app_metadata: { wacrm_superadmin: true } })).toBe(
      true
    );
    for (const v of ['true', 1, {}, undefined, false]) {
      expect(esSuperadmin({ app_metadata: { wacrm_superadmin: v } })).toBe(
        false
      );
    }
    expect(esSuperadmin({ app_metadata: {} })).toBe(false);
    expect(esSuperadmin({})).toBe(false);
    expect(esSuperadmin(undefined)).toBe(false);
    expect(esSuperadmin(null)).toBe(false);
  });

  it('user_metadata no da superadmin', () => {
    expect(
      esSuperadmin({
        app_metadata: {},
        user_metadata: { wacrm_superadmin: true },
      } as never)
    ).toBe(false);
  });
});
