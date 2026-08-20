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

// MARK: - Compact (keyboard height, renders from cache, no scrolling needed)

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
            Label("You're in: \(abbr)", systemImage: "checkmark.circle.fill")
                .font(.subheadline).foregroundStyle(.green)
        } else {
            Label("No pick yet", systemImage: "exclamationmark.circle")
                .font(.subheadline).foregroundStyle(.orange)
        }
    }
}

// MARK: - Expanded (full screen: pick / board / standings / history)

struct ExpandedView: View {
    @ObservedObject var model: ExtensionModel
    @State private var tab = 0
    @State private var code = ""

    var body: some View {
        VStack(spacing: 0) {
            if let banner = model.banner {
                Text(banner)
                    .font(.caption).padding(8).frame(maxWidth: .infinity)
                    .background(.yellow.opacity(0.2))
                    .onTapGesture { model.banner = nil }
            }

            if model.identity == nil {
                enrollForm
            } else {
                Picker("", selection: $tab) {
                    Text(model.week?.week.locked == true ? "Board" : "Pick").tag(0)
                    Text("Standings").tag(1)
                    Text("History").tag(2)
                }
                .pickerStyle(.segmented)
                .padding(10)

                ScrollView {
                    switch tab {
                    case 0: weekTab
                    case 1:
                        if let s = model.standings { StandingsListView(standings: s.standings).padding(.vertical, 6) }
                        else { ProgressView().padding(30).task { await model.loadStandings() } }
                    default:
                        if let h = model.history { HistoryListView(rows: h.picks) }
                        else { ProgressView().padding(30).task { await model.loadHistory() } }
                    }
                }
                .refreshable {
                    await model.refresh()
                    if tab == 1 { await model.loadStandings() }
                    if tab == 2 { await model.loadHistory() }
                }
            }
        }
    }

    @ViewBuilder
    private var weekTab: some View {
        if let week = model.week {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text(week.week.round == "REG" ? "Week \(week.week.weekNumber)" : "\(week.week.round) — bonus +\(SpreadFormat.points(week.week.playoffBonus ?? 0))")
                        .font(.title3.bold())
                    Spacer()
                    Text(week.week.locked ? "LOCKED" : SpreadFormat.lockLine(week.week.lockAt))
                        .font(.caption).foregroundStyle(week.week.locked ? .red : .secondary)
                }
                .padding(.horizontal, 12).padding(.top, 4)

                if week.week.locked {
                    WeekBoardView(week: week)
                    Divider().padding(.vertical, 4)
                    scoresList(week)
                } else {
                    if let pick = week.myPick, let abbr = pick.teamAbbr {
                        Label("Your pick: \(abbr) — tap another team to change it", systemImage: "lock.open")
                            .font(.caption).padding(.horizontal, 12)
                    } else {
                        Text("Team only has to WIN, not cover. Spread is your payout — snapshotted right before your game kicks off.")
                            .font(.caption).foregroundStyle(.secondary).padding(.horizontal, 12)
                    }
                    GameListView(week: week) { game, team in
                        Task { await model.submitPick(game: game, team: team) }
                    }
                }
            }
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
                HStack {
                    Text("\(g.away.abbr) @ \(g.home.abbr)").font(.caption)
                    Spacer()
                    if g.status == "SCHEDULED" {
                        Text(SpreadFormat.spread(g.home.spread) + " " + g.home.abbr)
                            .font(.caption).foregroundStyle(.secondary)
                    } else {
                        Text("\(g.away.score.map(String.init) ?? "–")–\(g.home.score.map(String.init) ?? "–")\(g.status == "FINAL" ? " F" : "")")
                            .font(.caption.monospacedDigit())
                    }
                }
                .padding(.horizontal, 12)
            }
        }
    }

    private var enrollForm: some View {
        VStack(spacing: 14) {
            Spacer()
            Text("🏈 The Spread").font(.title2.bold())
            Text("Paste the enrollment code Evan sent you.")
                .font(.caption).foregroundStyle(.secondary)
            TextField("Enrollment code", text: $code)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .frame(maxWidth: 220)
            Button("Enroll") {
                Task { await model.enroll(code: code.trimmingCharacters(in: .whitespaces)) }
            }
            .buttonStyle(.borderedProminent)
            .disabled(code.trimmingCharacters(in: .whitespaces).isEmpty)
            Spacer()
        }
        .padding()
    }
}
