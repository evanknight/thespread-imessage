import { describe, it, expect } from 'vitest';
import { scorePick, PLAYOFF_BONUS } from '@/lib/scoring';

// §11 pure-math cases. The rule: 10 + signed_spread + bonus on an outright win, else 0.
describe('scorePick', () => {
  it('underdog +3.5 wins -> 13.5', () => {
    const r = scorePick({ pickedTeamWon: true, signedSpread: 3.5, playoffBonus: 0 });
    expect(r.total_points).toBe(13.5);
    expect(r.outcome).toBe('W');
  });

  it('favorite -2.5 wins -> 7.5', () => {
    expect(scorePick({ pickedTeamWon: true, signedSpread: -2.5, playoffBonus: 0 }).total_points).toBe(7.5);
  });

  it('favorite -10.5 wins -> -0.5 (negative, never clamped)', () => {
    const r = scorePick({ pickedTeamWon: true, signedSpread: -10.5, playoffBonus: 0 });
    expect(r.total_points).toBe(-0.5);
    expect(r.outcome).toBe('W');
  });

  it('favorite -7.5 wins by 3 -> 2.5 (margin irrelevant, no cover concept)', () => {
    // "wins by 3" changes nothing: win is win.
    expect(scorePick({ pickedTeamWon: true, signedSpread: -7.5, playoffBonus: 0 }).total_points).toBe(2.5);
  });

  it('any loss -> 0 points, outcome L', () => {
    const r = scorePick({ pickedTeamWon: false, signedSpread: 3.5, playoffBonus: 0 });
    expect(r.total_points).toBe(0);
    expect(r.outcome).toBe('L');
  });

  it('tie (pickedTeamWon=false) -> 0 points, outcome L', () => {
    const r = scorePick({ pickedTeamWon: false, signedSpread: -3, playoffBonus: 0 });
    expect(r.outcome).toBe('L');
    expect(r.total_points).toBe(0);
  });

  it('no push: 3-point win on -3 still scores 7', () => {
    expect(scorePick({ pickedTeamWon: true, signedSpread: -3, playoffBonus: 0 }).total_points).toBe(7);
  });

  it('Super Bowl underdog +3.5 wins -> 17.5', () => {
    const r = scorePick({ pickedTeamWon: true, signedSpread: 3.5, playoffBonus: PLAYOFF_BONUS.SB });
    expect(r.base_points).toBe(13.5);
    expect(r.bonus_points).toBe(4);
    expect(r.total_points).toBe(17.5);
  });

  it('playoff bonus only on wins — losing SB pick gets 0, not 4', () => {
    expect(scorePick({ pickedTeamWon: false, signedSpread: 3.5, playoffBonus: 4 }).total_points).toBe(0);
  });

  it('bonus ladder is WC=1 DIV=2 CONF=3 SB=4', () => {
    expect([PLAYOFF_BONUS.WC, PLAYOFF_BONUS.DIV, PLAYOFF_BONUS.CONF, PLAYOFF_BONUS.SB]).toEqual([1, 2, 3, 4]);
  });
});
