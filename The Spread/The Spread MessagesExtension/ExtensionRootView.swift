import SwiftUI
import Messages

struct ExtensionRootView: View {
    @ObservedObject var model: ExtensionModel

    var body: some View {
        Group {
            if model.style == .compact {
                CompactView(model: model)
            } else {
                ExpandedView(model: model)
            }
        }
    }
}

// MARK: - Compact (keyboard height, renders from cache)

/// Right-hand region of the diagonal split (the opponent's side).
struct DiagonalSide: Shape {
    /// Where the split sits horizontally, 0...1.
    var ratio: CGFloat = 0.60
    /// How far the top edge leans past the bottom edge.
    var skew: CGFloat = 0.16

    func path(in rect: CGRect) -> Path {
        var p = Path()
        let topX = rect.width * (ratio + skew / 2)
        let bottomX = rect.width * (ratio - skew / 2)
        p.move(to: CGPoint(x: topX, y: 0))
        p.addLine(to: CGPoint(x: rect.width, y: 0))
        p.addLine(to: CGPoint(x: rect.width, y: rect.height))
        p.addLine(to: CGPoint(x: bottomX, y: rect.height))
        p.closeSubpath()
        return p
    }
}

/// The white slash between the two sides.
struct DiagonalStripe: Shape {
    var ratio: CGFloat = 0.60
    var skew: CGFloat = 0.16
    var thickness: CGFloat = 6

    func path(in rect: CGRect) -> Path {
        var p = Path()
        let topX = rect.width * (ratio + skew / 2)
        let bottomX = rect.width * (ratio - skew / 2)
        p.move(to: CGPoint(x: topX, y: 0))
        p.addLine(to: CGPoint(x: topX + thickness, y: 0))
        p.addLine(to: CGPoint(x: bottomX + thickness, y: rect.height))
        p.addLine(to: CGPoint(x: bottomX, y: rect.height))
        p.closeSubpath()
        return p
    }
}

/// Compact (keyboard height). A matchup card split on the diagonal: your team
/// takes the larger side with the full detail, the opponent gets the smaller
/// side with just identity, so which one you picked is unmistakable at a glance.
struct CompactView: View {
    @ObservedObject var model: ExtensionModel

    private var gold: Color { Color(red: 1, green: 0.84, blue: 0.3) }

    var body: some View {
        VStack(spacing: 0) {
            card
            button
        }
        .background(FieldBackground().ignoresSafeArea())
    }

    // MARK: card

    @ViewBuilder
    private var card: some View {
        if model.identity == nil {
            centered {
                Text("🏈 THE SPREAD")
                    .font(.system(size: 24, weight: .black)).foregroundStyle(gold)
                Text("Pick a team. They only have to win.")
                    .font(.caption).foregroundStyle(.white.opacity(0.85))
            }
        } else if let week = model.week {
            if let matchup = myMatchup(week) {
                matchupCard(week, matchup.mine, matchup.opponent)
            } else {
                centered {
                    Text(weekLabel(week))
                        .font(.system(size: 30, weight: .black)).foregroundStyle(gold)
                    Label(week.week.locked ? "You sat this week out" : "No pick yet",
                          systemImage: week.week.locked ? "moon.zzz.fill" : "exclamationmark.circle.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(week.week.locked ? .white : .orange)
                    Text(statusLine(week))
                        .font(.caption).foregroundStyle(.white.opacity(0.75))
                }
            }
        } else {
            centered {
                Text("🏈 THE SPREAD")
                    .font(.system(size: 24, weight: .black)).foregroundStyle(gold)
            }
        }
    }

    private func matchupCard(_ week: WeekResponse, _ mine: TeamSide, _ opponent: TeamSide) -> some View {
        ZStack {
            // Opponent's side, dimmed back so it recedes.
            DiagonalSide().fill(Color.black.opacity(0.34))
            DiagonalStripe().fill(Color.white.opacity(0.9))
            DiagonalStripe(thickness: 2)
                .offset(x: 12)
                .fill(Color.white.opacity(0.35))

            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text(weekLabel(week))
                        .font(.system(size: 15, weight: .black)).foregroundStyle(gold)
                    Spacer()
                }
                .padding(.horizontal, 16).padding(.top, 10)

                HStack(alignment: .center, spacing: 0) {
                    // Your team: the whole story.
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 8) {
                            TeamLogo(abbr: mine.abbr, size: 42)
                            Text(mine.abbr)
                                .font(.system(size: 34, weight: .black))
                                .foregroundStyle(.white)
                        }
                        HStack(spacing: 6) {
                            Text(SpreadFormat.spread(mine.spread))
                                .font(.subheadline.weight(.bold))
                                .foregroundStyle(mine.spread ?? 0 > 0 ? Color.green : Color.white)
                            if let sp = mine.spread {
                                Text("→ \(SpreadFormat.points(10 + sp + (week.week.playoffBonus ?? 0))) pts")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(.white)
                            }
                        }
                        Label(week.week.locked ? "LOCKED IN" : "YOUR PICK", systemImage: "checkmark.seal.fill")
                            .font(.system(size: 10, weight: .heavy))
                            .foregroundStyle(gold)
                    }
                    .padding(.leading, 16)

                    Spacer(minLength: 0)

                    // Opponent: identity only.
                    VStack(spacing: 3) {
                        TeamLogo(abbr: opponent.abbr, size: 24)
                        Text(opponent.abbr)
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(.white.opacity(0.75))
                    }
                    .padding(.trailing, 18)
                }
                .padding(.top, 4)

                Spacer(minLength: 0)

                Text(statusLine(week))
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.7))
                    .padding(.horizontal, 16).padding(.bottom, 10)
            }
        }
        .clipped()
    }

    private func centered<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(spacing: 8) { content() }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(.horizontal, 18)
    }

    // MARK: button

    private var button: some View {
        Button { model.requestExpand() } label: {
            Text(buttonTitle)
                .font(.subheadline.weight(.bold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
                .background(gold)
                .foregroundStyle(.black)
        }
        .buttonStyle(.plain)
    }

    private var buttonTitle: String {
        guard model.identity != nil else { return "Get set up" }
        guard let week = model.week else { return "Open" }
        if week.week.locked { return "See the board" }
        return week.myPick == nil ? "Make your pick" : "Change pick"
    }

    // MARK: helpers

    private func myMatchup(_ week: WeekResponse) -> (mine: TeamSide, opponent: TeamSide)? {
        guard let pick = week.myPick else { return nil }
        for g in week.games {
            if g.home.teamId == pick.teamId { return (g.home, g.away) }
            if g.away.teamId == pick.teamId { return (g.away, g.home) }
        }
        return nil
    }

    private func weekLabel(_ week: WeekResponse) -> String {
        week.week.round == "REG" ? "WEEK \(week.week.weekNumber)" : week.week.round
    }

    private func statusLine(_ week: WeekResponse) -> String {
        week.week.locked
            ? "Locked · \(week.submittedCount) of \(week.playerCount) picked"
            : "\(week.submittedCount) of \(week.playerCount) in · \(SpreadFormat.lockLine(week.week.lockAt))"
    }
}

// MARK: - Expanded

struct ExpandedView: View {
    @ObservedObject var model: ExtensionModel
    @State private var tab: SpreadTab = .thisWeek
    @State private var code = ""
    @State private var profileId: String?

    var body: some View {
        VStack(spacing: 0) {
            if model.identity == nil {
                EnrollFieldView(code: $code) {
                    Task { await model.enroll(code: code.trimmingCharacters(in: .whitespaces)) }
                }
            } else {
                ChipTabBar(selection: $tab)

                ScrollView {
                    switch tab {
                    case .thisWeek: thisWeekTab
                    case .leaderboard:
                        if let s = model.standings {
                            StandingsListView(standings: s.standings) { profileId = $0 }
                                .padding(.vertical, 4)
                        } else { ProgressView().padding(30).task { await model.loadStandings() } }
                    case .history:
                        if let s = model.standings { LeagueHistoryView(weeks: s.weeks) }
                        else { ProgressView().padding(30).task { await model.loadStandings() } }
                    case .profile:
                        ProfileView(model: model)
                    }
                }
                .refreshable {
                    await model.refresh()
                    if tab != .thisWeek { await model.loadStandings() }
                    if tab == .profile { await model.loadHistory() }
                }
                .safeAreaInset(edge: .bottom) {
                    if tab == .thisWeek, let week = model.week, !week.week.locked,
                       let pick = week.myPick, let abbr = pick.teamAbbr {
                        SendBar(week: week, abbr: abbr) { model.sendToChat() }
                    }
                }
            }
        }
        .overlay(alignment: .bottom) {
            if let banner = model.banner {
                Text(banner)
                    .font(.footnote.weight(.medium))
                    .padding(.horizontal, 14).padding(.vertical, 9)
                    .background(Capsule().fill(model.bannerIsError ? Color.red.opacity(0.92) : Color.green.opacity(0.92)))
                    .foregroundStyle(.white)
                    .padding(.bottom, 76)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .onTapGesture { model.banner = nil }
            }
        }
        .animation(.easeInOut(duration: 0.2), value: model.banner)
        .sheet(item: Binding(get: { profileId.map(Identified.init) }, set: { profileId = $0?.id })) { wrapped in
            if let s = model.standings {
                PlayerProfileSheet(playerId: wrapped.id, standings: s)
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
            }
        }
    }

    // This Week is a state machine:
    //   pre-lock            -> pick list (+ who's-in strip)
    //   locked/games live   -> LiveBoardView with matchups and scores
    //   last game FINAL     -> the server's week/current rolls to the next
    //                          week automatically, so this flips back to picks.
    @ViewBuilder
    private var thisWeekTab: some View {
        if let week = model.week {
            VStack(alignment: .leading, spacing: 12) {
                PickHero(week: week)
                if week.week.locked {
                    LiveBoardView(week: week)
                    Divider().padding(.vertical, 2)
                    Text("ALL GAMES")
                        .font(.caption.weight(.heavy)).foregroundStyle(.secondary)
                        .padding(.horizontal, 14)
                    scoresList(week)
                } else {
                    WhosInStrip(week: week)
                    GameListView(week: week, onPick: { game, team in
                        Task { await model.submitPick(game: game, team: team) }
                    }, onRemove: {
                        Task { await model.removePick() }
                    })
                }
            }
            .padding(.top, 4)
            .padding(.bottom, 16)
        } else if model.isLoading {
            ProgressView().padding(40)
        } else {
            Text("Nothing here yet. The season hasn't been synced.")
                .font(.caption).foregroundStyle(.secondary).padding(30)
        }
    }

    private func scoresList(_ week: WeekResponse) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(week.games) { g in
                HStack(spacing: 8) {
                    TeamLogo(abbr: g.away.abbr, size: 18)
                    Text("\(g.away.abbr) @ \(g.home.abbr)").font(.caption)
                    TeamLogo(abbr: g.home.abbr, size: 18)
                    Spacer()
                    if g.status == "SCHEDULED" {
                        Text(SpreadFormat.spread(g.home.spread) + " " + g.home.abbr)
                            .font(.caption).foregroundStyle(.secondary)
                    } else {
                        Text("\(g.away.score.map(String.init) ?? "–")–\(g.home.score.map(String.init) ?? "–")\(g.status == "FINAL" ? " F" : "")")
                            .font(.caption.monospacedDigit())
                    }
                }
                .padding(.horizontal, 14)
            }
        }
    }
}

/// Fixed bottom bar once you have a pick: always-visible state + the send CTA.
struct SendBar: View {
    let week: WeekResponse
    let abbr: String
    let onSend: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            TeamLogo(abbr: abbr, size: 30)
            VStack(alignment: .leading, spacing: 1) {
                Text("Your pick: \(abbr)")
                    .font(.subheadline.weight(.semibold))
                if let spread = mySpread {
                    Text("\(SpreadFormat.spread(spread)) → \(SpreadFormat.points(10 + spread + (week.week.playoffBonus ?? 0))) pts on a win")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
            Spacer()
            Button(action: onSend) {
                Label("Send to chat", systemImage: "paperplane.fill")
                    .font(.subheadline.weight(.semibold))
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(.bar)
    }

    private var mySpread: Double? {
        guard let pick = week.myPick else { return nil }
        for g in week.games {
            if g.home.teamId == pick.teamId { return g.home.spread }
            if g.away.teamId == pick.teamId { return g.away.spread }
        }
        return nil
    }
}

/// Profile: just you — season summary up top, then your week-by-week results.
struct ProfileView: View {
    @ObservedObject var model: ExtensionModel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let identity = model.identity {
                HStack(spacing: 12) {
                    Image(systemName: "person.crop.circle.fill")
                        .font(.system(size: 40)).foregroundStyle(.secondary)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(identity.displayName).font(.title3.bold())
                        if let me = myStanding {
                            Text("#\(myRank ?? 0) · \(SpreadFormat.points(me.totalPoints)) pts · \(me.wins)–\(me.losses)\(streakSuffix(me))")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                }
                .padding(.horizontal, 14).padding(.vertical, 12)
                Divider()
            }

            if let h = model.history {
                if h.picks.isEmpty {
                    Text("Your picks will show up here week by week.")
                        .font(.caption).foregroundStyle(.secondary).padding(30)
                } else {
                    ForEach(Array(h.picks.reversed().enumerated()), id: \.element.id) { idx, r in
                        personalRow(r)
                        if idx < h.picks.count - 1 { Divider().padding(.leading, 14) }
                    }
                }
            } else {
                ProgressView().padding(30)
                    .frame(maxWidth: .infinity)
                    .task { await model.loadHistory(); await model.loadStandings() }
            }

            Text("New phone or broken drawer? Enter your enrollment code again in the host app. Same code, same identity.")
                .font(.caption2).foregroundStyle(.secondary)
                .padding(14)
        }
    }

    private var myStanding: StandingRow? {
        guard let id = model.identity?.playerId else { return nil }
        return model.standings?.standings.first { $0.playerId == id }
    }

    private var myRank: Int? {
        guard let id = model.identity?.playerId,
              let idx = model.standings?.standings.firstIndex(where: { $0.playerId == id }) else { return nil }
        return idx + 1
    }

    private func streakSuffix(_ row: StandingRow) -> String {
        guard let s = row.streak, !s.isEmpty else { return "" }
        return " · \(s) streak"
    }

    private func personalRow(_ r: HistoryRow) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(r.round == "REG" ? "WEEK \(r.weekNumber)" : r.round)
                    .font(.caption2.weight(.heavy)).foregroundStyle(.secondary)
                HStack(spacing: 7) {
                    TeamLogo(abbr: r.pickedTeam, size: 24)
                    Text(r.pickedTeam ?? "—").font(.subheadline.weight(.bold))
                    Text(SpreadFormat.spread(r.officialSpread ?? r.lockTimeSpread))
                        .font(.caption)
                        .foregroundStyle(spreadColor(r.officialSpread ?? r.lockTimeSpread))
                }
                if let h = r.homeAbbr, let a = r.awayAbbr, let hs = r.homeScore, let asc = r.awayScore {
                    Text("\(a) \(asc)–\(hs) \(h)\(r.status == "FINAL" ? " F" : "")")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
            Spacer()
            if let outcome = r.outcome, let pts = r.totalPoints {
                Text(outcome == "W" ? (pts >= 0 ? "+\(SpreadFormat.points(pts))" : SpreadFormat.points(pts)) : outcome == "L" ? "0" : outcome)
                    .font(.title3.weight(.bold).monospacedDigit())
                    .foregroundStyle(outcome == "W" ? (pts < 0 ? .orange : .green) : outcome == "VOID" ? .orange : .secondary)
            } else {
                Text("pending").font(.caption).foregroundStyle(.secondary)
            }
            if let pid = r.pickId { DetailButton(pickId: pid) }
        }
        .padding(.vertical, 8).padding(.horizontal, 14)
    }
}

