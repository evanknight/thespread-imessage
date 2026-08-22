import SwiftUI

/// The containing app. Shares the extension's design language: field hero,
/// chip tabs, and the same shared row views — so the two never drift apart.
struct HostRootView: View {
    @State private var identity = SpreadKeychain.load()
    @State private var tab: SpreadTab = .thisWeek
    @State private var week: WeekResponse?
    @State private var standings: StandingsResponse?
    @State private var history: HistoryResponse?
    @State private var error: String?
    @State private var profileId: String?

    var body: some View {
        if identity == nil {
            EnrollFieldView(code: $enrollCode) { Task { await enroll() } }
                .overlay(alignment: .bottom) {
                    if let error {
                        Text(error).font(.caption).foregroundStyle(.white)
                            .padding(10)
                            .background(Capsule().fill(.red.opacity(0.9)))
                            .padding(.bottom, 30)
                    }
                }
        } else {
            VStack(spacing: 0) {
                HostHeader(week: week, name: identity?.displayName)
                ChipTabBar(selection: $tab)
                ScrollView {
                    switch tab {
                    case .thisWeek: thisWeekTab
                    case .leaderboard:
                        if let s = standings {
                            StandingsListView(standings: s.standings) { profileId = $0 }
                                .padding(.vertical, 4)
                        } else { ProgressView().padding(40) }
                    case .history:
                        if let s = standings { LeagueHistoryView(weeks: s.weeks) }
                        else { ProgressView().padding(40) }
                    case .profile: profileTab
                    }
                }
                .refreshable { await loadAll() }
            }
            .task { await loadAll() }
            .sheet(item: Binding(get: { profileId.map(Identified.init) }, set: { profileId = $0?.id })) { wrapped in
                if let s = standings {
                    PlayerProfileSheet(playerId: wrapped.id, standings: s)
                }
            }
        }
    }

    @State private var enrollCode = ""

    // MARK: tabs

    @ViewBuilder
    private var thisWeekTab: some View {
        if let week {
            VStack(alignment: .leading, spacing: 14) {
                if week.week.locked {
                    LiveBoardView(week: week)
                } else {
                    Text("Picks are made in Messages")
                        .font(.caption.weight(.heavy)).foregroundStyle(.secondary)
                        .padding(.horizontal, 14).padding(.top, 8)
                    WhosInStrip(week: week)
                    GamesPreviewList(week: week)
                }
            }
            .padding(.bottom, 20)
        } else if let error {
            ContentUnavailableView("Can't load", systemImage: "wifi.slash", description: Text(error))
        } else {
            ProgressView().padding(40)
        }
    }

    @ViewBuilder
    private var profileTab: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let identity {
                HStack(spacing: 12) {
                    Image(systemName: "person.crop.circle.fill")
                        .font(.system(size: 42)).foregroundStyle(.secondary)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(identity.displayName).font(.title3.bold())
                        if let me = standings?.standings.first(where: { $0.playerId == identity.playerId }) {
                            Text("\(SpreadFormat.points(me.totalPoints)) pts · \(me.wins)–\(me.losses)\(me.streak.map { $0.isEmpty ? "" : " · \($0)" } ?? "")")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                }
                .padding(.horizontal, 14).padding(.vertical, 12)
                Divider()
            }

            if let h = history, !h.picks.isEmpty {
                ForEach(Array(h.picks.reversed().enumerated()), id: \.element.id) { idx, r in
                    HistoryRowView(row: r)
                    if idx < h.picks.count - 1 { Divider().padding(.leading, 14) }
                }
            } else {
                Text("Your picks will show up here week by week.")
                    .font(.caption).foregroundStyle(.secondary).padding(30)
            }

            SetupCard()
            AccountCard(identity: $identity)
        }
    }

    // MARK: data

    private func loadAll() async {
        async let w = try? SpreadAPI.shared.currentWeek()
        async let s = try? SpreadAPI.shared.standings()
        async let h = try? SpreadAPI.shared.history()
        let (wv, sv, hv) = await (w, s, h)
        week = wv ?? week
        standings = sv ?? standings
        history = hv ?? history
        error = wv == nil ? "Couldn't reach the server" : nil
    }

    private func enroll() async {
        do {
            let resp = try await SpreadAPI.shared.enroll(code: enrollCode.trimmingCharacters(in: .whitespaces))
            let id = StoredIdentity(playerId: resp.playerId, displayName: resp.displayName, token: resp.token)
            SpreadKeychain.save(id)
            identity = id
            enrollCode = ""
            error = nil
            await loadAll()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Field-green app header.
struct HostHeader: View {
    let week: WeekResponse?
    let name: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("🏈 THE SPREAD")
                    .font(.caption.weight(.heavy)).foregroundStyle(.white.opacity(0.85))
                Spacer()
                if let name {
                    Text(name.uppercased())
                        .font(.caption2.weight(.bold)).foregroundStyle(.white.opacity(0.6))
                }
            }
            if let week {
                Text(week.week.round == "REG" ? "WEEK \(week.week.weekNumber)" : week.week.round)
                    .font(.system(size: 30, weight: .black))
                    .foregroundStyle(Color(red: 1, green: 0.84, blue: 0.3))
                Text(week.week.locked
                     ? "Picks locked · \(week.submittedCount) of \(week.playerCount) in"
                     : "\(week.submittedCount) of \(week.playerCount) in · \(SpreadFormat.lockLine(week.week.lockAt))")
                    .font(.caption).foregroundStyle(.white.opacity(0.85))
            }
        }
        .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FieldBackground())
    }
}

/// Read-only game list for the host app (picking happens in Messages).
struct GamesPreviewList: View {
    let week: WeekResponse

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(week.games.enumerated()), id: \.element.id) { idx, g in
                HStack(spacing: 10) {
                    TeamLogo(abbr: g.away.abbr, size: 26)
                    Text(g.away.abbr).font(.subheadline.weight(.semibold))
                    Text("@").font(.caption2).foregroundStyle(.secondary)
                    TeamLogo(abbr: g.home.abbr, size: 26)
                    Text(g.home.abbr).font(.subheadline.weight(.semibold))
                    Spacer()
                    if g.status == "SCHEDULED" {
                        VStack(alignment: .trailing, spacing: 1) {
                            Text("\(g.home.abbr) \(SpreadFormat.spread(g.home.spread))")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(spreadColor(g.home.spread))
                            Text(kickoff(g)).font(.caption2).foregroundStyle(.secondary)
                        }
                    } else {
                        Text("\(g.away.score.map(String.init) ?? "–")–\(g.home.score.map(String.init) ?? "–")\(g.status == "FINAL" ? " F" : "")")
                            .font(.caption.monospacedDigit())
                    }
                }
                .padding(.horizontal, 14).padding(.vertical, 9)
                if idx < week.games.count - 1 { Divider().padding(.leading, 14) }
            }
        }
    }

    private func kickoff(_ g: Game) -> String {
        let f = DateFormatter(); f.dateFormat = "EEE h:mm a"
        return f.string(from: g.kickoffAt)
    }
}

/// One personal history row, shared by host Profile and extension Profile.
struct HistoryRowView: View {
    let row: HistoryRow

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(row.round == "REG" ? "WEEK \(row.weekNumber)" : row.round)
                    .font(.caption2.weight(.heavy)).foregroundStyle(.secondary)
                HStack(spacing: 7) {
                    TeamLogo(abbr: row.pickedTeam, size: 24)
                    Text(row.pickedTeam ?? "—").font(.subheadline.weight(.bold))
                    Text(SpreadFormat.spread(row.officialSpread ?? row.lockTimeSpread))
                        .font(.caption)
                        .foregroundStyle(spreadColor(row.officialSpread ?? row.lockTimeSpread))
                }
                if let h = row.homeAbbr, let a = row.awayAbbr, let hs = row.homeScore, let asc = row.awayScore {
                    Text("\(a) \(asc)–\(hs) \(h)\(row.status == "FINAL" ? " F" : "")")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
            Spacer()
            if let outcome = row.outcome, let pts = row.totalPoints {
                Text(outcome == "W" ? (pts >= 0 ? "+\(SpreadFormat.points(pts))" : SpreadFormat.points(pts)) : outcome == "L" ? "0" : outcome)
                    .font(.title3.weight(.bold).monospacedDigit())
                    .foregroundStyle(outcome == "W" ? (pts < 0 ? .orange : .green) : outcome == "VOID" ? .orange : .secondary)
            } else {
                Text("pending").font(.caption).foregroundStyle(.secondary)
            }
            if let pid = row.pickId { DetailButton(pickId: pid) }
        }
        .padding(.vertical, 8).padding(.horizontal, 14)
    }
}

struct SetupCard: View {
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button { withAnimation { expanded.toggle() } } label: {
                HStack {
                    Label("Enable in Messages", systemImage: "questionmark.circle.fill")
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Image(systemName: expanded ? "chevron.up" : "chevron.down")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .buttonStyle(.plain)

            if expanded {
                VStack(alignment: .leading, spacing: 6) {
                    step("1", "Open any iMessage conversation.")
                    step("2", "Tap the ⊕ button next to the text field.")
                    step("3", "Scroll down and tap “More”.")
                    step("4", "Find The Spread and tap it, then pin it for quick access.")
                    step("5", "Make your pick, then hit send so the group sees you're in.")
                    Text("TestFlight builds expire after 90 days. If the app stops opening mid-season, reinstall from the TestFlight link.")
                        .font(.caption2).foregroundStyle(.secondary).padding(.top, 4)
                }
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.systemGray6)))
        .padding(.horizontal, 14).padding(.top, 16)
    }

    private func step(_ n: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(n)
                .font(.caption2.weight(.heavy))
                .frame(width: 18, height: 18)
                .background(Circle().fill(Color.accentColor))
                .foregroundStyle(.white)
            Text(text).font(.caption)
        }
    }
}

struct AccountCard: View {
    @Binding var identity: StoredIdentity?
    @State private var code = ""
    @State private var status: String?
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Account").font(.subheadline.weight(.semibold))
            Text("New phone or a broken drawer? Enter your enrollment code again. It adds this device without signing out anywhere else.")
                .font(.caption2).foregroundStyle(.secondary)
            HStack {
                TextField("Enrollment code", text: $code)
                    .textFieldStyle(.roundedBorder)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                Button(busy ? "…" : "Re-enroll") { Task { await enroll() } }
                    .buttonStyle(.borderedProminent)
                    .disabled(code.trimmingCharacters(in: .whitespaces).isEmpty || busy)
            }
            if let status { Text(status).font(.caption2).foregroundStyle(.secondary) }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.systemGray6)))
        .padding(.horizontal, 14).padding(.top, 12).padding(.bottom, 24)
    }

    private func enroll() async {
        busy = true
        defer { busy = false }
        do {
            let resp = try await SpreadAPI.shared.enroll(code: code.trimmingCharacters(in: .whitespaces))
            let id = StoredIdentity(playerId: resp.playerId, displayName: resp.displayName, token: resp.token)
            SpreadKeychain.save(id)
            identity = id
            code = ""
            status = "Enrolled as \(resp.displayName) ✓"
        } catch {
            status = error.localizedDescription
        }
    }
}
