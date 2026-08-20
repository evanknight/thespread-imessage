// Pure scoring rules. The only place point math lives.
//
// points = 10 + signed_spread_for_picked_team + playoff_bonus   if picked team WINS outright
// points = 0                                                    on loss or tie
//
// Signed spread is from the picked team's perspective (favorites negative).
// Totals can go NEGATIVE (e.g. -10.5 favorite wins -> -0.5). Never clamp.
// A tie counts as a LOSS in the record. Spreads are always whole or half
// points, so IEEE doubles represent every intermediate value exactly.

export type Outcome = 'W' | 'L' | 'NP' | 'VOID';

export interface ScoreResult {
  outcome: Outcome;
  base_points: number;
  bonus_points: number;
  total_points: number;
}

export function scorePick(opts: {
  pickedTeamWon: boolean;      // winner_team_id === picked team (ties => false)
  signedSpread: number;        // official spread from the picked team's perspective
  playoffBonus: number;        // 0 in the regular season
}): ScoreResult {
  if (!opts.pickedTeamWon) {
    return { outcome: 'L', base_points: 0, bonus_points: 0, total_points: 0 };
  }
  const base = 10 + opts.signedSpread;
  const bonus = opts.playoffBonus;
  return { outcome: 'W', base_points: base, bonus_points: bonus, total_points: base + bonus };
}

export const PLAYOFF_BONUS: Record<string, number> = {
  REG: 0, WC: 1, DIV: 2, CONF: 3, SB: 4,
};
