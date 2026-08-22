import SwiftUI
import UIKit

// Reusable SwiftUI views shared by the host app and the Messages extension.
// Design language: dark-green football-field hero (matches the message bubble),
// flat lists with dividers, big logos, gold week accent. All neutral surfaces
// use system colors so light/dark mode both work.

struct TeamLogo: View {
    let abbr: String?
    var size: CGFloat = 22

    var body: some View {
        if let abbr, UIImage(named: "team-\(abbr)") != nil {
            Image("team-\(abbr)")
                .resizable()
                .scaledToFit()
                .frame(width: size, height: size)
        }
    }
}

func spreadColor(_ v: Double?) -> Color {
    guard let v else { return .secondary }
    return v > 0 ? .green : v < 0 ? .red : .secondary
}

/// The field: deep green gradient with faint yard lines. Fixed dark in both
/// color schemes on purpose — white text on top always reads.
struct FieldBackground: View {
    var body: some View {
        LinearGradient(
            colors: [Color(red: 0.05, green: 0.25, blue: 0.12), Color(red: 0.02, green: 0.12, blue: 0.06)],
            startPoint: .top, endPoint: .bottom
        )
        .overlay(
            GeometryReader { geo in
                Path { p in
                    let step = geo.size.width / 7
                    for i in 1..<7 {
                        let x = CGFloat(i) * step
                        p.move(to: CGPoint(x: x, y: 0))
                        p.addLine(to: CGPoint(x: x, y: geo.size.height))
                    }
                }
                .stroke(Color.white.opacity(0.10), lineWidth: 2)
            }
        )
    }
}

private let gold = Color(red: 1, green: 0.84, blue: 0.3)

/// Hero band at the top of the pick tab. Shows the week + lock state, and the
/// caller's pick once they have one.
struct PickHero: View {
    let week: WeekResponse

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("🏈 THE SPREAD")
                    .font(.caption.weight(.heavy))
                    .foregroundStyle(.white.opacity(0.85))
                Spacer()
                Text(week.week.locked ? "🔒 LOCKED" : SpreadFormat.lockLine(week.week.lockAt).uppercased())
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.white.opacity(0.75))
            }
            Text(week.week.round == "REG" ? "WEEK \(week.week.weekNumber)" : week.week.round)
                .font(.system(size: 34, weight: .black))
                .foregroundStyle(gold)
            if let bonus = week.week.playoffBonus, bonus > 0 {
                Text("Playoff bonus +\(SpreadFormat.points(bonus)) on a win")
                    .font(.caption.bold()).foregroundStyle(.white.opacity(0.9))
            }
            if let pick = week.myPick, let abbr = pick.teamAbbr, !week.week.locked {
                HStack(spacing: 8) {
                    TeamLogo(abbr: abbr, size: 30)
                    Text("You're riding \(abbr)")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                    Spacer()
                    Text("tap another team to switch")
                        .font(.caption2).foregroundStyle(.white.opacity(0.6))
                }
                .padding(.top, 2)
            } else if !week.week.locked {
                Text("\(week.submittedCount) of \(week.playerCount) in · pick a team — they only have to WIN")
                    .font(.caption).foregroundStyle(.white.opacity(0.85))
            } else {
                Text("\(week.submittedCount) of \(week.playerCount) picked · the board is live")
                    .font(.caption).foregroundStyle(.white.opacity(0.85))
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FieldBackground())
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 12)
    }
}

struct StandingsListView: View {
    let standings: [StandingRow]

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(standings.enumerated()), id: \.element.id) { idx, row in
                HStack(spacing: 10) {
                    Text(medal(idx))
                        .font(.title3)
                        .frame(width: 34)
                    Text(row.displayName)
                        .font(.body.weight(idx == 0 ? .bold : .regular))
                    Spacer()
                    if let streak = row.streak, !streak.isEmpty {
                        Text(streak)
                            .font(.caption2.bold())
                            .padding(.horizontal, 7).padding(.vertical, 3)
                            .background(Capsule().fill(streak.hasPrefix("W") ? Color.green.opacity(0.16) : Color.red.opacity(0.16)))
                            .foregroundStyle(streak.hasPrefix("W") ? Color.green : Color.red)
                    }
                    Text("\(row.wins)–\(row.losses)")
                        .font(.caption).foregroundStyle(.secondary)
                        .frame(minWidth: 34)
                    Text(SpreadFormat.points(row.totalPoints))
                        .font(.title3.weight(.bold).monospacedDigit())
                        .frame(minWidth: 52, alignment: .trailing)
                }
                .padding(.vertical, 12).padding(.horizontal, 14)
                if idx < standings.count - 1 { Divider().padding(.leading, 14) }
            }
        }
    }

    private func medal(_ idx: Int) -> String {
        switch idx {
        case 0: return "🥇"
        case 1: return "🥈"
        case 2: return "🥉"
        default: return "\(idx + 1)"
        }
    }
}

struct WeekBoardView: View {
    let week: WeekResponse

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(week.players.enumerated()), id: \.element.id) { idx, p in
                HStack(spacing: 10) {
                    Text(p.displayName)
                    Spacer()
                    if let pick = p.pick, let abbr = pick.teamAbbr {
                        VStack(alignment: .trailing, spacing: 2) {
                            HStack(spacing: 7) {
                                TeamLogo(abbr: abbr, size: 26)
                                Text(abbr).font(.body.weight(.bold))
                                Text(SpreadFormat.spread(pick.officialSpread ?? pick.lockTimeSpread))
                                    .font(.callout)
                                    .foregroundStyle(spreadColor(pick.officialSpread ?? pick.lockTimeSpread))
                            }
                            // Rule B legibility: show the movement, not just the result.
                            if let lockLine = pick.lockTimeSpread, let final = pick.officialSpread, lockLine != final {
                                Text("at lock \(SpreadFormat.spread(lockLine)) → final \(SpreadFormat.spread(final))")
                                    .font(.caption2).foregroundStyle(.secondary)
                            }
                            if let outcome = pick.outcome, let pts = pick.totalPoints {
                                Text(outcomeLabel(outcome, pts))
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(outcome == "W" ? .green : outcome == "VOID" ? .orange : .red)
                            }
                        }
                        if let pid = p.pick?.pickId { DetailButton(pickId: pid) }
                    } else if p.hasPicked {
                        Label("in", systemImage: "lock.fill").font(.caption).foregroundStyle(.secondary)
                    } else {
                        Text("no pick yet").font(.caption).foregroundStyle(.tertiary)
                    }
                }
                .padding(.vertical, 10).padding(.horizontal, 14)
                if idx < week.players.count - 1 { Divider().padding(.leading, 14) }
            }
        }
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
        VStack(spacing: 0) {
            HStack(spacing: 4) {
                Image(systemName: "clock.arrow.circlepath").font(.system(size: 9))
                Text("DraftKings lines updated \(SpreadFormat.ago(week.linesUpdatedAt))")
                Spacer()
            }
            .font(.system(size: 10))
            .foregroundStyle(.tertiary)
            .padding(.bottom, 6)
            ForEach(Array(week.games.enumerated()), id: \.element.id) { idx, game in
                VStack(spacing: 8) {
                    Text(kickoffLabel(game))
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                    HStack(spacing: 10) {
                        teamTile(game, game.away)
                        Text("@").font(.caption).foregroundStyle(.tertiary)
                        teamTile(game, game.home)
                    }
                }
                .padding(.vertical, 12)
                if idx < week.games.count - 1 { Divider() }
            }
        }
        .padding(.horizontal, 14)
    }

    private func teamTile(_ game: Game, _ team: TeamSide) -> some View {
        let mine = week.myPick?.teamId == team.teamId
        // Selected = primary ink (black in light mode, white in dark). Blue is
        // reserved for the one true CTA: Send to chat.
        let ink = Color.primary
        let paper = Color(.systemBackground)
        return Button { onPick(game, team) } label: {
            VStack(spacing: 3) {
                HStack(spacing: 7) {
                    TeamLogo(abbr: team.abbr, size: 34)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(team.abbr).font(.headline)
                        Text(SpreadFormat.nickname(team.name))
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(mine ? paper.opacity(0.7) : Color.secondary)
                            .lineLimit(1)
                    }
                }
                HStack(spacing: 5) {
                    Text(SpreadFormat.spread(team.spread))
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(mine ? paper : spreadColor(team.spread))
                    if let spread = team.spread {
                        // Risk/reward at a glance: what this pick pays on a win.
                        Text("→ \(SpreadFormat.points(10 + spread + (week.week.playoffBonus ?? 0)))")
                            .font(.caption)
                            .foregroundStyle(mine ? paper.opacity(0.7) : Color.secondary)
                    }
                }
            }
            .frame(maxWidth: .infinity, minHeight: 68)
            .background(RoundedRectangle(cornerRadius: 12).fill(mine ? ink : Color(.systemGray6)))
            .foregroundStyle(mine ? paper : Color.primary)
        }
        .buttonStyle(.plain)
    }

    private func kickoffLabel(_ game: Game) -> String {
        let f = DateFormatter()
        f.dateFormat = "EEE h:mm a"
        return f.string(from: game.kickoffAt)
    }
}

/// The locked-week board: one row per player with their pick, the matchup,
/// the live/final score, and points once scored. This is what This Week shows
/// from lock until the last game of the week goes final.
struct LiveBoardView: View {
    let week: WeekResponse

    private var gamesById: [String: Game] {
        Dictionary(uniqueKeysWithValues: week.games.map { ($0.id, $0) })
    }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(week.players.enumerated()), id: \.element.id) { idx, p in
                HStack(spacing: 12) {
                    if let pick = p.pick, let abbr = pick.teamAbbr {
                        TeamLogo(abbr: abbr, size: 34)
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(p.displayName).font(.subheadline.weight(.semibold))
                                Text("·").foregroundStyle(.tertiary)
                                Text(abbr).font(.subheadline.weight(.bold))
                                Text(SpreadFormat.spread(pick.officialSpread ?? pick.lockTimeSpread))
                                    .font(.subheadline)
                                    .foregroundStyle(spreadColor(pick.officialSpread ?? pick.lockTimeSpread))
                            }
                            if let game = pick.gameId.flatMap({ gamesById[$0] }) {
                                Text(gameLine(game))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            if let lockLine = pick.lockTimeSpread, let final = pick.officialSpread, lockLine != final {
                                Text("at lock \(SpreadFormat.spread(lockLine)) → final \(SpreadFormat.spread(final))")
                                    .font(.caption2).foregroundStyle(.tertiary)
                            }
                        }
                        Spacer()
                        outcomeBadge(pick)
                        if let pid = pick.pickId { DetailButton(pickId: pid) }
                    } else {
                        Image(systemName: p.hasPicked ? "lock.fill" : "zzz")
                            .font(.title3).foregroundStyle(.tertiary)
                            .frame(width: 34)
                        Text(p.displayName).font(.subheadline.weight(.semibold))
                        Spacer()
                        Text(p.hasPicked ? "in" : "no pick")
                            .font(.caption).foregroundStyle(.tertiary)
                    }
                }
                .padding(.vertical, 10).padding(.horizontal, 14)
                if idx < week.players.count - 1 { Divider().padding(.leading, 60) }
            }
        }
    }

    private func gameLine(_ g: Game) -> String {
        let matchup = "\(g.away.abbr) @ \(g.home.abbr)"
        switch g.status {
        case "SCHEDULED":
            let f = DateFormatter(); f.dateFormat = "EEE h:mm a"
            return "\(matchup) · \(f.string(from: g.kickoffAt))"
        case "FINAL":
            return "\(matchup) · \(g.away.score.map(String.init) ?? "–")–\(g.home.score.map(String.init) ?? "–") FINAL"
        case "POSTPONED", "CANCELLED":
            return "\(matchup) · \(g.status)"
        default:
            return "\(matchup) · \(g.away.score.map(String.init) ?? "0")–\(g.home.score.map(String.init) ?? "0") LIVE"
        }
    }

    @ViewBuilder
    private func outcomeBadge(_ pick: PickDetail) -> some View {
        if let outcome = pick.outcome, let pts = pick.totalPoints {
            VStack(alignment: .trailing, spacing: 0) {
                Text(outcome == "W" ? (pts >= 0 ? "+\(SpreadFormat.points(pts))" : SpreadFormat.points(pts))
                     : outcome == "L" ? "0" : outcome)
                    .font(.title3.weight(.bold).monospacedDigit())
                    .foregroundStyle(outcome == "W" ? (pts < 0 ? Color.orange : Color.green)
                                     : outcome == "VOID" ? Color.orange : Color.red)
                Text(outcome == "W" ? "win" : outcome == "L" ? "loss" : "")
                    .font(.caption2).foregroundStyle(.tertiary)
            }
        } else {
            Text("pending").font(.caption).foregroundStyle(.tertiary)
        }
    }
}

/// Week-by-week league history: every player every locked week — pick, line,
/// final score, and points. No-pick weeks show as exactly that.
struct LeagueHistoryView: View {
    let weeks: [WeekResultRow]

    private var grouped: [(label: String, rows: [WeekResultRow])] {
        var order: [Int] = []
        var buckets: [Int: [WeekResultRow]] = [:]
        for r in weeks {
            if buckets[r.weekNumber] == nil { order.append(r.weekNumber) }
            buckets[r.weekNumber, default: []].append(r)
        }
        return order.map { wn in
            let rows = buckets[wn]!
            let label = rows[0].round == "REG" ? "WEEK \(wn)" : rows[0].round
            return (label, rows)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            if weeks.isEmpty {
                Text("Nothing here until the first week locks")
                    .font(.caption).foregroundStyle(.secondary).padding(30)
            }
            ForEach(grouped, id: \.label) { section in
                VStack(spacing: 0) {
                    HStack {
                        Text(section.label)
                            .font(.caption.weight(.heavy))
                            .foregroundStyle(.secondary)
                        Spacer()
                    }
                    .padding(.horizontal, 14).padding(.top, 14).padding(.bottom, 4)
                    ForEach(section.rows) { r in
                        HStack(spacing: 10) {
                            Text(r.displayName)
                                .font(.subheadline)
                                .frame(width: 64, alignment: .leading)
                            if let team = r.pickedTeam {
                                TeamLogo(abbr: team, size: 24)
                                VStack(alignment: .leading, spacing: 1) {
                                    HStack(spacing: 5) {
                                        Text(team).font(.subheadline.weight(.bold))
                                        Text(SpreadFormat.spread(r.officialSpread ?? r.lockTimeSpread))
                                            .font(.caption)
                                            .foregroundStyle(spreadColor(r.officialSpread ?? r.lockTimeSpread))
                                    }
                                    if let h = r.homeAbbr, let a = r.awayAbbr, let hs = r.homeScore, let asc = r.awayScore {
                                        Text("\(a) \(asc)–\(hs) \(h)\(r.gameStatus == "FINAL" ? " F" : "")")
                                            .font(.caption2).foregroundStyle(.secondary)
                                    }
                                }
                            } else {
                                Text("no pick")
                                    .font(.caption).foregroundStyle(.tertiary)
                            }
                            Spacer()
                            pointsBadge(r)
                            if let pid = r.pickId { DetailButton(pickId: pid) }
                        }
                        .padding(.vertical, 7).padding(.horizontal, 14)
                    }
                    Divider()
                }
            }
        }
    }

    @ViewBuilder
    private func pointsBadge(_ r: WeekResultRow) -> some View {
        if r.pickedTeam == nil {
            Text("0").font(.callout.weight(.bold).monospacedDigit()).foregroundStyle(.tertiary)
        } else if let outcome = r.outcome, let pts = r.totalPoints {
            switch outcome {
            case "W":
                Text(pts >= 0 ? "+\(SpreadFormat.points(pts))" : SpreadFormat.points(pts))
                    .font(.callout.weight(.bold).monospacedDigit())
                    .foregroundStyle(pts < 0 ? Color.orange : Color.green)
            case "L":
                Text("0").font(.callout.weight(.bold).monospacedDigit()).foregroundStyle(.red)
            case "VOID":
                Text("VOID").font(.caption.weight(.bold)).foregroundStyle(.orange)
            default:
                Text("—").font(.callout).foregroundStyle(.secondary)
            }
        } else {
            Text("pending").font(.caption).foregroundStyle(.tertiary)
        }
    }
}
