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

struct CompactView: View {
    @ObservedObject var model: ExtensionModel

    var body: some View {
        VStack(spacing: 10) {
            if model.identity == nil {
                Text("🏈 The Spread").font(.headline)
                Text("Enter your enrollment code to play").font(.caption).foregroundStyle(.secondary)
                Button("Get set up") { model.requestExpand() }.buttonStyle(.borderedProminent)
            } else if let week = model.week {
                Text(week.week.round == "REG" ? "Week \(week.week.weekNumber)" : week.week.round)
                    .font(.headline)
                if week.week.locked {
                    Text("Locked · \(week.submittedCount) of \(week.playerCount) picked")
                        .font(.caption).foregroundStyle(.secondary)
                    Button("See the board") { model.requestExpand() }.buttonStyle(.borderedProminent)
                } else {
                    statusLine(week)
                    Text("\(week.submittedCount) of \(week.playerCount) in · \(SpreadFormat.lockLine(week.week.lockAt))")
                        .font(.caption).foregroundStyle(.secondary)
                    Button(week.myPick == nil ? "Make your pick" : "Change pick") { model.requestExpand() }
                        .buttonStyle(.borderedProminent)
                }
            } else {
                Text("🏈 The Spread").font(.headline)
                Button("Open") { model.requestExpand() }.buttonStyle(.borderedProminent)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder
    private func statusLine(_ week: WeekResponse) -> some View {
        if let pick = week.myPick, let abbr = pick.teamAbbr {
            HStack(spacing: 6) {
                TeamLogo(abbr: abbr, size: 22)
                Label("You're in: \(abbr)", systemImage: "checkmark.circle.fill")
                    .font(.subheadline).foregroundStyle(.green)
            }
        } else {
            Label("No pick yet", systemImage: "exclamationmark.circle")
                .font(.subheadline).foregroundStyle(.orange)
        }
    }
}

// MARK: - Glass tab bar

enum SpreadTab: Int, CaseIterable {
    case thisWeek, leaderboard, history, profile

    var title: String {
        switch self {
        case .thisWeek: return "This Week"
        case .leaderboard: return "Leaders"
        case .history: return "History"
        case .profile: return "Profile"
        }
    }

    var icon: String {
        switch self {
        case .thisWeek: return "sportscourt.fill"
        case .leaderboard: return "list.number"
        case .history: return "clock.fill"
        case .profile: return "person.crop.circle.fill"
        }
    }
}

struct ChipTabBar: View {
    @Binding var selection: SpreadTab

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(SpreadTab.allCases, id: \.rawValue) { tab in
                    Button {
                        withAnimation(.easeOut(duration: 0.15)) { selection = tab }
                    } label: {
                        HStack(spacing: 5) {
                            Image(systemName: tab.icon).font(.system(size: 13, weight: .semibold))
                            Text(tab.title).font(.system(size: 14, weight: .semibold))
                        }
                        .padding(.horizontal, 14).padding(.vertical, 9)
                        .background(Capsule().fill(selection == tab ? Color.primary : Color(.systemGray6)))
                        .foregroundStyle(selection == tab ? Color(.systemBackground) : Color.primary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 12)
        }
        .padding(.top, 10).padding(.bottom, 6)
    }
}

// MARK: - Expanded

struct ExpandedView: View {
    @ObservedObject var model: ExtensionModel
    @State private var tab: SpreadTab = .thisWeek
    @State private var code = ""

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
                        if let s = model.standings { StandingsListView(standings: s.standings).padding(.vertical, 4) }
                        else { ProgressView().padding(30).task { await model.loadStandings() } }
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
                    GameListView(week: week) { game, team in
                        Task { await model.submitPick(game: game, team: team) }
                    }
                }
            }
            .padding(.top, 4)
            .padding(.bottom, 16)
        } else if model.isLoading {
            ProgressView().padding(40)
        } else {
            Text("Nothing here yet — season hasn't been synced.")
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

/// Pre-lock clarity: who's in, and an explicit note that picks stay hidden.
struct WhosInStrip: View {
    let week: WeekResponse

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                ForEach(week.players) { p in
                    HStack(spacing: 3) {
                        Image(systemName: p.hasPicked ? "checkmark.circle.fill" : "circle.dotted")
                            .font(.system(size: 11))
                            .foregroundStyle(p.hasPicked ? .green : .secondary)
                        Text(p.displayName)
                            .font(.system(size: 11, weight: .medium))
                    }
                    .padding(.horizontal, 8).padding(.vertical, 5)
                    .background(Capsule().fill(Color(.systemGray6)))
                }
            }
            Text("Everyone's picks are revealed here at lock — nobody can see yours before then.")
                .font(.caption2).foregroundStyle(.tertiary)
        }
        .padding(.horizontal, 14)
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

            Text("New phone or broken drawer? Enter your enrollment code again in the host app — same code, same identity.")
                .font(.caption2).foregroundStyle(.tertiary)
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
                Text("pending").font(.caption).foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 8).padding(.horizontal, 14)
    }
}

/// Enrollment on the field.
struct EnrollFieldView: View {
    @Binding var code: String
    let onEnroll: () -> Void

    var body: some View {
        ZStack {
            FieldBackground().ignoresSafeArea()
            VStack(spacing: 16) {
                Spacer()
                Text("🏈")
                    .font(.system(size: 56))
                Text("THE SPREAD")
                    .font(.system(size: 34, weight: .black))
                    .foregroundStyle(Color(red: 1, green: 0.84, blue: 0.3))
                Text("Pick a team. They only have to win.\nThe spread is your payout.")
                    .font(.subheadline)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white.opacity(0.85))
                VStack(spacing: 10) {
                    TextField("Enrollment code", text: $code)
                        .textFieldStyle(.roundedBorder)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .frame(maxWidth: 220)
                    Button(action: onEnroll) {
                        Text("Let's ride")
                            .font(.headline)
                            .frame(maxWidth: 220)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color(red: 1, green: 0.84, blue: 0.3))
                    .foregroundStyle(.black)
                    .disabled(code.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                .padding(20)
                .background(RoundedRectangle(cornerRadius: 16).fill(.ultraThinMaterial))
                Spacer()
                Spacer()
            }
            .padding()
        }
    }
}
