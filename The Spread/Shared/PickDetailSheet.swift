import SwiftUI

/// The full story of one pick: when it was made, how the line moved, what the
/// game did, and exactly how the points were computed.
///
/// Movement is always shown in POINTS, never percent — because
/// points = 10 + spread + bonus, a one-point line move is exactly one point of
/// payout. Percent would make -1.5 → -3.0 read as "100%" and -10 → -11.5 as
/// "15%" for the identical 1.5-point move.
struct PickDetailSheet: View {
    let pickId: String
    @Environment(\.dismiss) private var dismiss

    @State private var detail: PickDetailResponse?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Group {
                if let detail {
                    ScrollView { content(detail).padding(.bottom, 24) }
                } else if let error {
                    ContentUnavailableView("Can't load", systemImage: "exclamationmark.triangle", description: Text(error))
                } else {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .navigationTitle("Pick detail")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .task { await load() }
    }

    private func load() async {
        do { detail = try await SpreadAPI.shared.pickDetail(id: pickId) }
        catch { self.error = error.localizedDescription }
    }

    // MARK: sections

    @ViewBuilder
    private func content(_ d: PickDetailResponse) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            header(d)
            matchup(d)
            sectionTitle("The line")
            lineSection(d)
            sectionTitle("Timeline")
            timeline(d)
            sectionTitle("Scoring")
            scoring(d)
            if let note = d.result?.note {
                Text(note)
                    .font(.caption2).foregroundStyle(.orange)
                    .padding(.horizontal, 16).padding(.top, 8)
            }
        }
    }

    private func header(_ d: PickDetailResponse) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                TeamLogo(abbr: d.pick.teamAbbr, size: 42)
                VStack(alignment: .leading, spacing: 1) {
                    Text(d.pick.displayName)
                        .font(.caption.weight(.bold)).foregroundStyle(.white.opacity(0.75))
                    Text("\(d.pick.teamAbbr) \(SpreadFormat.spread(effectiveSpread(d)))")
                        .font(.title2.weight(.black)).foregroundStyle(.white)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 1) {
                    Text(headlineValue(d))
                        .font(.system(size: 30, weight: .black))
                        .foregroundStyle(headlineColor(d))
                    Text(headlineCaption(d))
                        .font(.caption2.weight(.semibold)).foregroundStyle(.white.opacity(0.7))
                }
            }
            Text(d.week.round == "REG" ? "WEEK \(d.week.weekNumber)" : "\(d.week.round) · BONUS +\(SpreadFormat.points(d.week.playoffBonus ?? 0))")
                .font(.caption2.weight(.heavy)).foregroundStyle(Color(red: 1, green: 0.84, blue: 0.3))
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FieldBackground())
    }

    private func matchup(_ d: PickDetailResponse) -> some View {
        HStack(spacing: 12) {
            teamColumn(abbr: d.game.awayAbbr, score: d.game.awayScore,
                       won: d.game.winnerAbbr == d.game.awayAbbr,
                       picked: !d.game.pickedIsHome)
            VStack(spacing: 2) {
                Text(statusLabel(d)).font(.caption2.weight(.bold)).foregroundStyle(.secondary)
                if d.game.status == "SCHEDULED", let k = d.game.kickoffAt {
                    Text(kickoffFormat(k)).font(.caption2).foregroundStyle(.tertiary)
                }
            }
            teamColumn(abbr: d.game.homeAbbr, score: d.game.homeScore,
                       won: d.game.winnerAbbr == d.game.homeAbbr,
                       picked: d.game.pickedIsHome)
        }
        .padding(.vertical, 14).padding(.horizontal, 16)
    }

    private func teamColumn(abbr: String, score: Int?, won: Bool, picked: Bool) -> some View {
        VStack(spacing: 4) {
            TeamLogo(abbr: abbr, size: 36)
            Text(abbr).font(.subheadline.weight(picked ? .black : .semibold))
            Text(score.map(String.init) ?? "–")
                .font(.title2.weight(.bold).monospacedDigit())
                .foregroundStyle(won ? .green : .primary)
            if picked {
                Text("YOUR PICK").font(.system(size: 8, weight: .heavy)).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private func lineSection(_ d: PickDetailResponse) -> some View {
        VStack(spacing: 0) {
            lineRow("Opened", d.line.open, emphasis: false)
            lineRow("At lock", d.line.atLock, emphasis: false)
            if let official = d.line.official {
                lineRow("At kickoff", official, emphasis: true, trailing: "OFFICIAL")
            } else if let current = d.line.current {
                lineRow("Right now", current, emphasis: true, trailing: "LIVE")
            }
        }

        if let delta = d.line.deltaLockToKickoff, delta != 0 {
            HStack(spacing: 6) {
                Image(systemName: delta > 0 ? "arrow.up.right" : "arrow.down.right")
                    .font(.caption.weight(.bold))
                Text(delta > 0
                     ? "Moved +\(SpreadFormat.points(delta)) in your favour after lock — \(SpreadFormat.points(abs(delta))) extra points"
                     : "Moved \(SpreadFormat.points(delta)) against you after lock — cost you \(SpreadFormat.points(abs(delta))) points")
                    .font(.caption)
            }
            .foregroundStyle(delta > 0 ? .green : .red)
            .padding(.horizontal, 16).padding(.top, 8)
        } else if d.line.deltaLockToKickoff == 0 {
            Text("The line never moved after lock.")
                .font(.caption).foregroundStyle(.secondary)
                .padding(.horizontal, 16).padding(.top, 8)
        }

        if d.line.series.count > 1 {
            LineSparkline(points: d.line.series)
                .frame(height: 54)
                .padding(.horizontal, 16).padding(.top, 12)
            Text("\(d.line.sampleCount) DraftKings samples")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.tertiary)
                .padding(.horizontal, 16).padding(.top, 4)
        }
    }

    private func lineRow(_ label: String, _ point: LinePoint?, emphasis: Bool, trailing: String? = nil) -> some View {
        HStack {
            Text(label)
                .font(.subheadline.weight(emphasis ? .bold : .regular))
            if let trailing {
                Text(trailing)
                    .font(.system(size: 8, weight: .heavy))
                    .padding(.horizontal, 5).padding(.vertical, 2)
                    .background(Capsule().fill(Color.primary.opacity(0.1)))
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 0) {
                Text(SpreadFormat.spread(point?.spread))
                    .font(.body.weight(emphasis ? .black : .semibold).monospacedDigit())
                    .foregroundStyle(spreadColor(point?.spread))
                if let at = point?.capturedAt {
                    Text(stampFormat(at)).font(.system(size: 9)).foregroundStyle(.tertiary)
                }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
    }

    private func timeline(_ d: PickDetailResponse) -> some View {
        VStack(spacing: 0) {
            timelineRow("Picked", d.pick.submittedAt, note: relativeToLock(d.pick.submittedAt, d.week.lockAt))
            if let updated = d.pick.updatedAt, let submitted = d.pick.submittedAt,
               abs(updated.timeIntervalSince(submitted)) > 1 {
                timelineRow("Last change", updated,
                            note: d.pick.changeCount > 0
                                ? "\(d.pick.changeCount) switch\(d.pick.changeCount == 1 ? "" : "es") · \(relativeToLock(updated, d.week.lockAt))"
                                : relativeToLock(updated, d.week.lockAt))
            }
            timelineRow("Picks locked", d.week.lockAt, note: nil)
            timelineRow("Kickoff", d.game.kickoffAt, note: nil)
            if let scored = d.result?.scoredAt {
                timelineRow("Scored", scored, note: nil)
            }
        }
    }

    private func timelineRow(_ label: String, _ date: Date?, note: String?) -> some View {
        HStack(alignment: .top) {
            Text(label).font(.subheadline)
            Spacer()
            VStack(alignment: .trailing, spacing: 1) {
                Text(date.map(stampFormat) ?? "—")
                    .font(.subheadline.monospacedDigit())
                if let note {
                    Text(note).font(.caption2).foregroundStyle(.tertiary)
                }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 7)
    }

    @ViewBuilder
    private func scoring(_ d: PickDetailResponse) -> some View {
        if let result = d.result {
            VStack(spacing: 0) {
                scoreRow("Base", "10")
                scoreRow("Spread", SpreadFormat.spread(d.line.official?.spread ?? d.line.current?.spread))
                if (d.week.playoffBonus ?? 0) > 0 {
                    scoreRow("Playoff bonus", "+\(SpreadFormat.points(d.week.playoffBonus ?? 0))")
                }
                Divider().padding(.horizontal, 16).padding(.vertical, 4)
                HStack {
                    Text(result.outcome == "W" ? "Won outright" : result.outcome == "L" ? "Did not win" : result.outcome)
                        .font(.subheadline.weight(.bold))
                    Spacer()
                    Text(SpreadFormat.points(result.totalPoints ?? 0))
                        .font(.title3.weight(.black).monospacedDigit())
                        .foregroundStyle(result.outcome == "W" ? ((result.totalPoints ?? 0) < 0 ? .orange : .green) : .red)
                }
                .padding(.horizontal, 16).padding(.vertical, 6)
                if result.outcome == "L" {
                    Text("A loss or tie always scores 0 — the spread only pays on an outright win.")
                        .font(.caption2).foregroundStyle(.tertiary)
                        .padding(.horizontal, 16)
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("If \(d.pick.teamAbbr) wins").font(.subheadline)
                    Spacer()
                    Text(SpreadFormat.points(d.potentialPoints ?? 0))
                        .font(.title3.weight(.black).monospacedDigit()).foregroundStyle(.green)
                }
                HStack {
                    Text("If they lose or tie").font(.subheadline)
                    Spacer()
                    Text("0").font(.title3.weight(.black).monospacedDigit()).foregroundStyle(.secondary)
                }
                if !d.week.locked {
                    Text("Not final until this game kicks off — the official number is DraftKings' line right before kickoff.")
                        .font(.caption2).foregroundStyle(.tertiary).padding(.top, 2)
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 4)
        }
    }

    private func scoreRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).font(.subheadline).foregroundStyle(.secondary)
            Spacer()
            Text(value).font(.subheadline.monospacedDigit())
        }
        .padding(.horizontal, 16).padding(.vertical, 4)
    }

    private func sectionTitle(_ t: String) -> some View {
        HStack {
            Text(t.uppercased()).font(.caption.weight(.heavy)).foregroundStyle(.secondary)
            Spacer()
        }
        .padding(.horizontal, 16).padding(.top, 18).padding(.bottom, 4)
    }

    // MARK: helpers

    private func effectiveSpread(_ d: PickDetailResponse) -> Double? {
        d.line.official?.spread ?? d.line.current?.spread ?? d.line.atLock?.spread
    }

    private func headlineValue(_ d: PickDetailResponse) -> String {
        if let r = d.result, let pts = r.totalPoints {
            return r.outcome == "W" ? (pts >= 0 ? "+\(SpreadFormat.points(pts))" : SpreadFormat.points(pts))
                 : r.outcome == "L" ? "0" : r.outcome
        }
        return SpreadFormat.points(d.potentialPoints ?? 0)
    }

    private func headlineColor(_ d: PickDetailResponse) -> Color {
        guard let r = d.result, let pts = r.totalPoints else { return Color(red: 1, green: 0.84, blue: 0.3) }
        if r.outcome == "W" { return pts < 0 ? .orange : .green }
        if r.outcome == "L" { return .red }
        return .orange
    }

    private func headlineCaption(_ d: PickDetailResponse) -> String {
        guard let r = d.result else { return "potential" }
        switch r.outcome {
        case "W": return "points"
        case "L": return "no points"
        case "NP": return "no game"
        default: return "needs review"
        }
    }

    private func statusLabel(_ d: PickDetailResponse) -> String {
        switch d.game.status {
        case "FINAL": return "FINAL"
        case "SCHEDULED": return "VS"
        case "POSTPONED": return "PPD"
        case "CANCELLED": return "CANCELLED"
        default: return "LIVE"
        }
    }

    private func kickoffFormat(_ d: Date) -> String {
        let f = DateFormatter(); f.dateFormat = "EEE h:mm a"
        return f.string(from: d)
    }

    private func stampFormat(_ d: Date) -> String {
        let f = DateFormatter(); f.dateFormat = "EEE MMM d, h:mm a"
        return f.string(from: d)
    }

    private func relativeToLock(_ date: Date?, _ lock: Date?) -> String? {
        guard let date, let lock else { return nil }
        let mins = Int(lock.timeIntervalSince(date) / 60)
        if mins < 0 { return "after lock" }
        if mins < 60 { return "\(mins) min before lock" }
        if mins < 60 * 24 { return "\(mins / 60)h before lock" }
        return "\(mins / (60 * 24))d before lock"
    }
}

/// Hand-drawn polyline — lighter than pulling Swift Charts into an extension
/// that runs under a tight memory ceiling.
struct LineSparkline: View {
    let points: [LinePoint]

    var body: some View {
        GeometryReader { geo in
            let vals = points.compactMap(\.spread)
            if vals.count > 1 {
                let lo = vals.min()!, hi = vals.max()!
                let span = max(hi - lo, 0.5)
                let stepX = geo.size.width / CGFloat(vals.count - 1)
                let y: (Double) -> CGFloat = { v in
                    geo.size.height - CGFloat((v - lo) / span) * (geo.size.height - 10) - 5
                }
                ZStack {
                    Path { p in
                        p.move(to: CGPoint(x: 0, y: y(vals[0])))
                        for (i, v) in vals.enumerated().dropFirst() {
                            p.addLine(to: CGPoint(x: CGFloat(i) * stepX, y: y(v)))
                        }
                    }
                    .stroke(Color.accentColor, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))

                    Circle()
                        .fill(Color.accentColor)
                        .frame(width: 6, height: 6)
                        .position(x: CGFloat(vals.count - 1) * stepX, y: y(vals.last!))
                }
                .overlay(alignment: .topLeading) {
                    Text(SpreadFormat.spread(hi)).font(.system(size: 9)).foregroundStyle(.tertiary)
                }
                .overlay(alignment: .bottomLeading) {
                    Text(SpreadFormat.spread(lo)).font(.system(size: 9)).foregroundStyle(.tertiary)
                }
            }
        }
    }
}

/// The ⓘ affordance used on board / history / profile rows.
struct DetailButton: View {
    let pickId: String
    @State private var showing = false

    var body: some View {
        Button { showing = true } label: {
            Image(systemName: "info.circle")
                .font(.system(size: 15))
                .foregroundStyle(.secondary)
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showing) {
            PickDetailSheet(pickId: pickId)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }
}
