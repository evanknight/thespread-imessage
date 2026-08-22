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

/// Compact (keyboard height). One centred block: the matchup on a single line
/// with your team enlarged, and the payout plus YOUR PICK hanging underneath on
/// your team's side, so ownership is obvious without any background trickery.
struct CompactView: View {
    @ObservedObject var model: ExtensionModel

    private var gold: Color { Color(red: 1, green: 0.84, blue: 0.3) }

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            content
            Spacer(minLength: 0)
            button
                .padding(.horizontal, 20)
                .padding(.bottom, 14)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(FieldBackground().ignoresSafeArea())
    }

    @ViewBuilder
    private var content: some View {
        if model.identity == nil {
            VStack(spacing: 6) {
                Text("🏈 THE SPREAD")
                    .font(.system(size: 24, weight: .black)).foregroundStyle(gold)
                Text("Pick a team. They only have to win.")
                    .font(.system(size: 14, weight: .medium)).foregroundStyle(.white.opacity(0.85))
            }
        } else if let week = model.week {
            if let m = myMatchup(week) {
                matchupBlock(week, m.mine, m.opponent)
            } else {
                VStack(spacing: 9) {
                    Text(weekLabel(week))
                        .font(.system(size: 30, weight: .black)).foregroundStyle(gold)
                    Label(week.week.locked ? "You sat this week out" : "No pick yet",
                          systemImage: week.week.locked ? "moon.zzz.fill" : "exclamationmark.circle.fill")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(week.week.locked ? .white : .orange)
                    Text(statusLine(week))
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.white.opacity(0.8))
                }
            }
        } else {
            Text("🏈 THE SPREAD")
                .font(.system(size: 24, weight: .black)).foregroundStyle(gold)
        }
    }

    /// Left-aligned internals inside a block that is itself centred, so the
    /// payout and seal line up under your team rather than under the matchup.
    /// Weight carries the ownership, not colour: both abbreviations are the
    /// same size, yours is black and the opponent's is medium and dimmed.
    private func matchupBlock(_ week: WeekResponse, _ mine: TeamSide, _ opponent: TeamSide) -> some View {
        VStack(alignment: .leading, spacing: 11) {
            Text(weekLabel(week))
                .font(.system(size: 16, weight: .black))
                .foregroundStyle(gold)
                .tracking(0.5)

            HStack(spacing: 10) {
                TeamLogo(abbr: mine.abbr, size: 32)
                Text(mine.abbr)
                    .font(.system(size: 30, weight: .black))
                    .foregroundStyle(.white)
                Text("vs")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.5))
                Text(opponent.abbr)
                    .font(.system(size: 30, weight: .medium))
                    .foregroundStyle(.white.opacity(0.65))
                TeamLogo(abbr: opponent.abbr, size: 26)
                    .opacity(0.85)
            }

            HStack(spacing: 10) {
                if let sp = mine.spread {
                    Text("\(SpreadFormat.points(10 + sp + (week.week.playoffBonus ?? 0))) pts")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(.white)
                }
                Label(week.week.locked ? "LOCKED IN" : "YOUR PICK", systemImage: "checkmark.seal.fill")
                    .font(.system(size: 12, weight: .heavy))
                    .foregroundStyle(gold)
            }

            Text(statusLine(week))
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.white.opacity(0.8))
        }
    }

    private var button: some View {
        Button { model.requestExpand() } label: {
            Text(buttonTitle)
                .font(.system(size: 17, weight: .bold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Capsule().fill(gold))
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

