import SwiftUI

/// Minimal host app: enrollment, standings/board/history for when the Messages
/// drawer misbehaves, and the how-to-enable walkthrough. The iMessage extension
/// is the real product.
struct HostRootView: View {
    @State private var identity = SpreadKeychain.load()

    var body: some View {
        TabView {
            BoardScreen().tabItem { Label("This Week", systemImage: "sportscourt") }
            StandingsScreen().tabItem { Label("Standings", systemImage: "list.number") }
            HistoryScreen().tabItem { Label("History", systemImage: "clock.arrow.circlepath") }
            HowToScreen().tabItem { Label("Setup", systemImage: "questionmark.circle") }
            SettingsScreen(identity: $identity).tabItem { Label("Account", systemImage: "person.circle") }
        }
    }
}

struct BoardScreen: View {
    @State private var week: WeekResponse?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                if let week {
                    VStack(alignment: .leading, spacing: 16) {
                        header(week)
                        WeekBoardView(week: week)
                        Divider()
                        gamesSection(week)
                    }
                    .padding(.vertical)
                } else if let error {
                    ContentUnavailableView("Can't load", systemImage: "wifi.slash", description: Text(error))
                } else {
                    ProgressView().padding(40)
                }
            }
            .navigationTitle("The Spread")
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func header(_ w: WeekResponse) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(w.week.round == "REG" ? "Week \(w.week.weekNumber)" : w.week.round)
                .font(.title2.bold())
            Text(w.week.locked
                 ? "Picks are locked — board is live"
                 : "\(w.submittedCount) of \(w.playerCount) in · \(SpreadFormat.lockLine(w.week.lockAt))")
                .font(.subheadline).foregroundStyle(.secondary)
        }
        .padding(.horizontal, 12)
    }

    private func gamesSection(_ w: WeekResponse) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Games").font(.headline).padding(.horizontal, 12)
            ForEach(w.games) { g in
                HStack {
                    Text("\(g.away.abbr) @ \(g.home.abbr)")
                    Spacer()
                    if g.status == "SCHEDULED" {
                        Text("\(g.home.abbr) \(SpreadFormat.spread(g.home.spread))")
                            .font(.caption).foregroundStyle(.secondary)
                    } else {
                        Text("\(g.away.score.map(String.init) ?? "–")–\(g.home.score.map(String.init) ?? "–") \(g.status == "FINAL" ? "F" : "·")")
                            .font(.caption.monospacedDigit())
                    }
                }
                .padding(.horizontal, 12).padding(.vertical, 4)
            }
        }
    }

    private func load() async {
        do { week = try await SpreadAPI.shared.currentWeek(); error = nil }
        catch { self.error = error.localizedDescription }
    }
}

struct StandingsScreen: View {
    @State private var standings: StandingsResponse?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                if let standings {
                    StandingsListView(standings: standings.standings)
                        .padding(.vertical)
                } else if let error {
                    ContentUnavailableView("Can't load", systemImage: "wifi.slash", description: Text(error))
                } else {
                    ProgressView().padding(40)
                }
            }
            .navigationTitle(standings.map { "Season \($0.season)" } ?? "Standings")
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func load() async {
        do { standings = try await SpreadAPI.shared.standings(); error = nil }
        catch { self.error = error.localizedDescription }
    }
}

struct HistoryScreen: View {
    @State private var standings: StandingsResponse?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                if let standings {
                    LeagueHistoryView(weeks: standings.weeks)
                } else if let error {
                    ContentUnavailableView("Can't load", systemImage: "wifi.slash", description: Text(error))
                } else {
                    ProgressView().padding(40)
                }
            }
            .navigationTitle("History")
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func load() async {
        do { standings = try await SpreadAPI.shared.standings(); error = nil }
        catch { self.error = error.localizedDescription }
    }
}

struct HowToScreen: View {
    var body: some View {
        NavigationStack {
            List {
                Section("Enable in Messages") {
                    Text("1. Open any iMessage conversation.")
                    Text("2. Tap the ⊕ (plus) button next to the text field.")
                    Text("3. Scroll down and tap “More”.")
                    Text("4. Find “The Spread” and tap it. Pin it for quick access.")
                    Text("5. Make your pick from the drawer — then hit send so the group sees you're in.")
                }
                Section("The rules") {
                    Text("Pick one team a week. They only have to WIN — not cover.")
                    Text("Win = 10 + the spread (favorites subtract, underdogs add). Playoffs add a bonus.")
                    Text("Picks lock at the week's first kickoff. Your spread is DraftKings' line right before YOUR game kicks off.")
                    Text("Ties count as losses. A big favorite that wins can score negative. Choose wisely.")
                }
                Section("Heads up") {
                    Text("TestFlight builds expire after 90 days — when the app stops opening mid-season, reinstall from the TestFlight invite link.")
                    Text("If the drawer ever breaks, the web board has everything: standings and this week's picks.")
                }
            }
            .navigationTitle("Setup & Rules")
        }
    }
}

struct SettingsScreen: View {
    @Binding var identity: StoredIdentity?
    @State private var code = ""
    @State private var status: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                if let identity {
                    Section("Enrolled") {
                        LabeledContent("Player", value: identity.displayName)
                    }
                    Section {
                        Text("Need to re-enroll (new phone, broken drawer)? Enter your enrollment code again below — it issues a fresh key and disables the old one.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                Section(identity == nil ? "Enroll" : "Re-enroll") {
                    TextField("Enrollment code", text: $code)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                    Button(busy ? "Enrolling…" : "Enroll") { Task { await enroll() } }
                        .disabled(code.trimmingCharacters(in: .whitespaces).isEmpty || busy)
                    if let status { Text(status).font(.caption) }
                }
            }
            .navigationTitle("Account")
        }
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
