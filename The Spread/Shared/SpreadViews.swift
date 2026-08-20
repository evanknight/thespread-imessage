import SwiftUI
import UIKit

// Reusable SwiftUI views shared by the host app and the Messages extension.

struct StandingsListView: View {
    let standings: [StandingRow]

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(standings.enumerated()), id: \.element.id) { idx, row in
                HStack {
                    Text("\(idx + 1)").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                        .frame(width: 20, alignment: .leading)
                    Text(medal(idx) + row.displayName).fontWeight(idx == 0 ? .bold : .regular)
                    Spacer()
                    Text("\(row.wins)–\(row.losses)").font(.caption).foregroundStyle(.secondary)
                    Text(SpreadFormat.points(row.totalPoints))
                        .font(.body.monospacedDigit()).fontWeight(.semibold)
                        .frame(minWidth: 52, alignment: .trailing)
                }
                .padding(.vertical, 8).padding(.horizontal, 12)
                if idx < standings.count - 1 { Divider() }
            }
        }
    }

    private func medal(_ idx: Int) -> String {
        ["🥇 ", "🥈 ", "🥉 "].indices.contains(idx) ? ["🥇 ", "🥈 ", "🥉 "][idx] : ""
    }
}

struct WeekBoardView: View {
    let week: WeekResponse

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(week.players) { p in
                HStack {
                    Text(p.displayName)
                    Spacer()
                    if let pick = p.pick, let abbr = pick.teamAbbr {
                        VStack(alignment: .trailing, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(abbr).fontWeight(.bold)
                                Text(SpreadFormat.spread(pick.officialSpread ?? pick.lockTimeSpread))
                                    .foregroundStyle(.secondary)
                            }
                            // Rule B legibility: always show lock line vs final line.
                            if let lockLine = pick.lockTimeSpread, let final = pick.officialSpread, lockLine != final {
                                Text("at lock \(SpreadFormat.spread(lockLine)) → final \(SpreadFormat.spread(final))")
                                    .font(.caption2).foregroundStyle(.secondary)
                            }
                            if let outcome = pick.outcome, let pts = pick.totalPoints {
                                Text(outcomeLabel(outcome, pts))
                                    .font(.caption).fontWeight(.semibold)
                                    .foregroundStyle(outcome == "W" ? .green : outcome == "VOID" ? .orange : .red)
                            }
                        }
                    } else if p.hasPicked {
                        Label("in", systemImage: "lock.fill").font(.caption).foregroundStyle(.secondary)
                    } else {
                        Text("no pick yet").font(.caption).foregroundStyle(.tertiary)
                    }
                }
            }
        }
        .padding(.horizontal, 12)
    }

    private func outcomeLabel(_ outcome: String, _ pts: Double) -> String {
        switch outcome {
        case "W": return "W · \(SpreadFormat.points(pts)) pts"
        case "L": return "L · 0"
        case "NP": return "no game"
        case "VOID": return "VOID — needs manual spread"
        default: return outcome
        }
    }
}

struct GameListView: View {
    let week: WeekResponse
    let onPick: (Game, TeamSide) -> Void

    var body: some View {
        VStack(spacing: 10) {
            ForEach(week.games) { game in
                VStack(spacing: 6) {
                    Text(kickoffLabel(game))
                        .font(.caption2).foregroundStyle(.secondary)
                    HStack(spacing: 8) {
                        teamButton(game, game.away)
                        Text("@").font(.caption).foregroundStyle(.tertiary)
                        teamButton(game, game.home)
                    }
                }
                .padding(.vertical, 6)
                .frame(maxWidth: .infinity)
                .background(RoundedRectangle(cornerRadius: 10).fill(Color(.secondarySystemBackground)))
            }
        }
        .padding(.horizontal, 12)
    }

    private func teamButton(_ game: Game, _ team: TeamSide) -> some View {
        let mine = week.myPick?.teamId == team.teamId
        return Button { onPick(game, team) } label: {
            VStack(spacing: 2) {
                Text(team.abbr).fontWeight(.bold)
                Text(SpreadFormat.spread(team.spread)).font(.caption)
                if let spread = team.spread {
                    // Risk/reward at a glance: what this pick pays if they win.
                    Text("→ \(SpreadFormat.points(10 + spread + (week.week.playoffBonus ?? 0))) pts")
                        .font(.caption2).opacity(0.75)
                }
            }
            .frame(width: 96, height: 58)
            .background(RoundedRectangle(cornerRadius: 8).fill(mine ? Color.accentColor : Color(.tertiarySystemBackground)))
            .foregroundStyle(mine ? Color.white : Color.primary)
        }
        .buttonStyle(.plain)
    }

    private func kickoffLabel(_ game: Game) -> String {
        let f = DateFormatter()
        f.dateFormat = "EEE h:mm a"
        return f.string(from: game.kickoffAt)
    }
}

struct HistoryListView: View {
    let rows: [HistoryRow]

    var body: some View {
        VStack(spacing: 0) {
            if rows.isEmpty {
                Text("No picks yet").foregroundStyle(.secondary).padding()
            }
            ForEach(rows) { r in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(weekLabel(r)).font(.caption).foregroundStyle(.secondary)
                        HStack(spacing: 6) {
                            Text(r.pickedTeam ?? "—").fontWeight(.bold)
                            Text(SpreadFormat.spread(r.officialSpread ?? r.lockTimeSpread))
                                .foregroundStyle(.secondary)
                            if let h = r.homeAbbr, let a = r.awayAbbr, let hs = r.homeScore, let as_ = r.awayScore {
                                Text("\(a) \(as_)–\(hs) \(h)").font(.caption).foregroundStyle(.tertiary)
                            }
                        }
                    }
                    Spacer()
                    resultBadge(r)
                }
                .padding(.vertical, 8).padding(.horizontal, 12)
                Divider()
            }
        }
    }

    private func weekLabel(_ r: HistoryRow) -> String {
        r.round == "REG" ? "Week \(r.weekNumber)" : r.round
    }

    @ViewBuilder
    private func resultBadge(_ r: HistoryRow) -> some View {
        if let outcome = r.outcome, let pts = r.totalPoints {
            Text(outcome == "W" ? (pts >= 0 ? "+\(SpreadFormat.points(pts))" : SpreadFormat.points(pts)) : outcome == "L" ? "0" : outcome)
                .font(.body.monospacedDigit()).fontWeight(.bold)
                .foregroundStyle(outcome == "W" ? (pts < 0 ? .orange : .green) : outcome == "VOID" ? .orange : .secondary)
        } else {
            Text("pending").font(.caption).foregroundStyle(.tertiary)
        }
    }
}
