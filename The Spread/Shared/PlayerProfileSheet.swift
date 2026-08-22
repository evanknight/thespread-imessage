import SwiftUI

/// One player's whole season: summary stats plus every pick.
/// Everything here is computed from the standings payload the app already has,
/// so opening a profile costs no extra request.
struct PlayerProfileSheet: View {
    let playerId: String
    let standings: StandingsResponse
    @Environment(\.dismiss) private var dismiss

    private var row: StandingRow? { standings.standings.first { $0.playerId == playerId } }
    private var rank: Int { (standings.standings.firstIndex { $0.playerId == playerId } ?? 0) + 1 }
    private var weeks: [WeekResultRow] {
        standings.weeks.filter { $0.playerId == playerId }.sorted { $0.weekNumber > $1.weekNumber }
    }
    private var withPick: [WeekResultRow] { weeks.filter { $0.pickedTeam != nil } }
    private var scored: [WeekResultRow] { withPick.filter { $0.outcome == "W" || $0.outcome == "L" } }

    private func spreadOf(_ w: WeekResultRow) -> Double? { w.officialSpread ?? w.lockTimeSpread }
    private func pts(_ w: WeekResultRow) -> Double { w.totalPoints ?? 0 }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header
                    sectionTitle("Season")
                    statGrid
                    sectionTitle("Every pick")
                    picks
                }
                .padding(.bottom, 24)
            }
            .navigationTitle(row?.displayName ?? "Player")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(row?.displayName ?? "—")
                .font(.system(size: 30, weight: .black)).foregroundStyle(.white)
            HStack(spacing: 8) {
                Text("#\(rank)")
                    .font(.caption.weight(.heavy))
                    .foregroundStyle(Color(red: 1, green: 0.84, blue: 0.3))
                Text("\(SpreadFormat.points(row?.totalPoints ?? 0)) pts")
                    .font(.caption.weight(.bold)).foregroundStyle(.white)
                Text("\(row?.wins ?? 0)–\(row?.losses ?? 0)")
                    .font(.caption).foregroundStyle(.white.opacity(0.8))
                if let s = row?.streak, !s.isEmpty {
                    Text(s)
                        .font(.caption2.weight(.heavy))
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Capsule().fill(.white.opacity(0.18)))
                        .foregroundStyle(.white)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FieldBackground())
    }

    private var statGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
            stat("Avg / pick", avgText, sub: "\(scored.count) scored week\(scored.count == 1 ? "" : "s")")
            stat("Avg spread", avgSpreadText, sub: "\(dogs.count) dogs · \(favs.count) favs")
            stat("Best week", bestText, sub: bestSub, color: .green)
            stat("Worst week", worstText, sub: worstSub, color: .red)
            stat("As underdog", record(dogs), sub: "teams getting points")
            stat("As favourite", record(favs), sub: "teams laying points")
            stat("Most picked", favTeam?.0 ?? "—", sub: favTeam.map { "\($0.1)×" } ?? "no picks yet")
            stat("Missed weeks", "\(weeks.count - withPick.count)", sub: "no pick submitted")
        }
        .padding(.horizontal, 14)
    }

    private func stat(_ label: String, _ value: String, sub: String, color: Color = .primary) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(.system(size: 9, weight: .heavy)).foregroundStyle(.secondary)
            Text(value)
                .font(.title3.weight(.bold).monospacedDigit()).foregroundStyle(color)
            Text(sub).font(.system(size: 10)).foregroundStyle(.tertiary).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.systemGray6)))
    }

    private var picks: some View {
        VStack(spacing: 0) {
            if weeks.isEmpty {
                Text("Nothing until the first week locks.")
                    .font(.caption).foregroundStyle(.secondary).padding(24)
            }
            ForEach(Array(weeks.enumerated()), id: \.element.id) { idx, w in
                HStack(spacing: 10) {
                    Text(w.round == "REG" ? "\(w.weekNumber)" : w.round)
                        .font(.caption2.weight(.heavy)).foregroundStyle(.secondary)
                        .frame(width: 26, alignment: .leading)
                    if let team = w.pickedTeam {
                        TeamLogo(abbr: team, size: 24)
                        VStack(alignment: .leading, spacing: 1) {
                            HStack(spacing: 5) {
                                Text(team).font(.subheadline.weight(.bold))
                                Text(SpreadFormat.spread(spreadOf(w)))
                                    .font(.caption).foregroundStyle(spreadColor(spreadOf(w)))
                            }
                            if let h = w.homeAbbr, let a = w.awayAbbr, let hs = w.homeScore, let asc = w.awayScore {
                                Text("\(a) \(asc)–\(hs) \(h)\(w.gameStatus == "FINAL" ? " F" : "")")
                                    .font(.system(size: 10)).foregroundStyle(.tertiary)
                            }
                        }
                    } else {
                        Text("no pick").font(.caption).foregroundStyle(.tertiary)
                    }
                    Spacer()
                    if w.pickedTeam == nil {
                        Text("0").font(.callout.weight(.bold)).foregroundStyle(.tertiary)
                    } else if let outcome = w.outcome {
                        Text(outcome == "W" ? (pts(w) >= 0 ? "+\(SpreadFormat.points(pts(w)))" : SpreadFormat.points(pts(w)))
                             : outcome == "L" ? "0" : outcome)
                            .font(.callout.weight(.bold).monospacedDigit())
                            .foregroundStyle(outcome == "W" ? (pts(w) < 0 ? .orange : .green) : .red)
                    } else {
                        Text("pending").font(.caption2).foregroundStyle(.tertiary)
                    }
                    if let pid = w.pickId { DetailButton(pickId: pid) }
                }
                .padding(.vertical, 8).padding(.horizontal, 14)
                if idx < weeks.count - 1 { Divider().padding(.leading, 14) }
            }
        }
    }

    private func sectionTitle(_ t: String) -> some View {
        HStack {
            Text(t.uppercased()).font(.caption.weight(.heavy)).foregroundStyle(.secondary)
            Spacer()
        }
        .padding(.horizontal, 16).padding(.top, 18).padding(.bottom, 6)
    }

    // MARK: derived stats

    private var dogs: [WeekResultRow] { scored.filter { (spreadOf($0) ?? 0) > 0 } }
    private var favs: [WeekResultRow] { scored.filter { (spreadOf($0) ?? 0) < 0 } }

    private func record(_ list: [WeekResultRow]) -> String {
        "\(list.filter { $0.outcome == "W" }.count)–\(list.filter { $0.outcome == "L" }.count)"
    }

    private var avgText: String {
        guard !scored.isEmpty else { return "—" }
        return String(format: "%.1f", scored.reduce(0.0) { $0 + pts($1) } / Double(scored.count))
    }

    private var avgSpreadText: String {
        guard !scored.isEmpty else { return "—" }
        let v = scored.reduce(0.0) { $0 + (spreadOf($1) ?? 0) } / Double(scored.count)
        return SpreadFormat.spread((v * 10).rounded() / 10)
    }

    private var best: WeekResultRow? { scored.max { pts($0) < pts($1) } }
    private var worst: WeekResultRow? { scored.min { pts($0) < pts($1) } }
    private var bestText: String { best.map { pts($0) >= 0 ? "+\(SpreadFormat.points(pts($0)))" : SpreadFormat.points(pts($0)) } ?? "—" }
    private var worstText: String { worst.map { SpreadFormat.points(pts($0)) } ?? "—" }
    private var bestSub: String { best.map { "\($0.pickedTeam ?? "") · Week \($0.weekNumber)" } ?? "no results yet" }
    private var worstSub: String { worst.map { "\($0.pickedTeam ?? "") · Week \($0.weekNumber)" } ?? "no results yet" }

    private var favTeam: (String, Int)? {
        var counts: [String: Int] = [:]
        for w in withPick { if let t = w.pickedTeam { counts[t, default: 0] += 1 } }
        return counts.max { $0.value < $1.value }.map { ($0.key, $0.value) }
    }
}
