import Foundation
import Combine
import Messages
import SwiftUI

@MainActor
final class ExtensionModel: ObservableObject {
    @Published var style: MSMessagesAppPresentationStyle = .compact
    @Published var week: WeekResponse?
    @Published var standings: StandingsResponse?
    @Published var history: HistoryResponse?
    @Published var identity: StoredIdentity? = SpreadKeychain.load()
    @Published var banner: String?
    @Published var bannerIsError = false
    @Published var isLoading = false
    private var bannerTask: Task<Void, Never>?

    weak var controller: MSMessagesAppViewController?

    private var conversation: MSConversation? { controller?.activeConversation }

    // MARK: lifecycle

    func becameActive(selected: MSMessage?) {
        identity = SpreadKeychain.load()
        if week == nil { week = SpreadCache.load() }   // compact renders instantly from cache
        refreshSoon()
    }

    func refreshSoon() {
        Task { await refresh() }
    }

    func requestExpand() {
        controller?.requestPresentationStyle(.expanded)
    }

    // MARK: network

    func refresh() async {
        guard identity != nil else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let w = try await SpreadAPI.shared.currentWeek()
            week = w
            SpreadCache.save(w)
        } catch {
            if week == nil { banner = error.localizedDescription }
        }
    }

    func loadStandings() async {
        do { standings = try await SpreadAPI.shared.standings() } catch { banner = error.localizedDescription }
    }

    func loadHistory() async {
        do { history = try await SpreadAPI.shared.history() } catch { banner = error.localizedDescription }
    }

    func enroll(code: String) async {
        do {
            let resp = try await SpreadAPI.shared.enroll(code: code)
            let id = StoredIdentity(playerId: resp.playerId, displayName: resp.displayName, token: resp.token)
            SpreadKeychain.save(id)
            identity = id
            await refresh()
        } catch {
            showBanner(error.localizedDescription, isError: true)
        }
    }

    func showBanner(_ text: String, isError: Bool = false) {
        banner = text
        bannerIsError = isError
        bannerTask?.cancel()
        bannerTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(5))
            if !Task.isCancelled { self?.banner = nil }
        }
    }

    func submitPick(game: Game, team: TeamSide) async {
        guard let wk = week?.week else { return }
        do {
            let resp = try await SpreadAPI.shared.submitPick(weekId: wk.id, gameId: game.id, teamId: team.teamId)
            stageBubble(weekId: wk.id, pickId: resp.pick.id, weekNumber: resp.weekNumber,
                        submitted: resp.submittedCount, total: resp.playerCount, lockAt: resp.lockAt)
            let potential = (team.spread ?? 0) + 10 + (wk.playoffBonus ?? 0)
            showBanner("\(team.abbr) locked in for \(SpreadFormat.points(potential)) pts if they win — tap send ➤")
            await refresh()
        } catch SpreadAPIError.locked {
            showBanner("Too late — picks locked at first kickoff.", isError: true)
            await refresh()
        } catch {
            showBanner(error.localizedDescription, isError: true)
        }
    }

    // MARK: the shared weekly bubble

    /// One MSSession per week: every submission updates the same bubble instead
    /// of stacking new ones, and each update bumps it to the bottom of the
    /// transcript — a free nudge at whoever hasn't picked.
    private func session(forWeek weekId: String) -> MSSession {
        if let sel = conversation?.selectedMessage,
           sel.url?.absoluteString.contains(weekId) == true,
           let s = sel.session {
            return s
        }
        if let data = SpreadConfig.groupDefaults.data(forKey: "msession-\(weekId)"),
           let s = try? NSKeyedUnarchiver.unarchivedObject(ofClass: MSSession.self, from: data) {
            return s
        }
        return MSSession()   // fallback: worst case is one extra bubble this week
    }

    /// The prominent path: re-stage the weekly bubble from current state and
    /// collapse to compact so Messages' send button is right there.
    func sendToChat() {
        guard let week, let pick = week.myPick, let pickId = pick.pickId else { return }
        stageBubble(weekId: week.week.id, pickId: pickId, weekNumber: week.week.weekNumber,
                    submitted: week.submittedCount, total: week.playerCount, lockAt: week.week.lockAt)
        showBanner("Staged — hit the blue ➤ to send")
        controller?.requestPresentationStyle(.compact)
    }

    private func stageBubble(weekId: String, pickId: String, weekNumber: Int,
                             submitted: Int, total: Int, lockAt: Date?) {
        guard let conv = conversation else { return }
        let session = session(forWeek: weekId)
        let message = MSMessage(session: session)

        // SECRECY INVARIANT (do not weaken in review): the URL is the message
        // payload and anyone can read it. It carries ONLY opaque ids — the
        // picked team must never appear here in any form.
        var comps = URLComponents()
        comps.scheme = "https"
        comps.host = "thespread.invalid"
        comps.path = "/week"
        comps.queryItems = [
            URLQueryItem(name: "w", value: weekId),
            URLQueryItem(name: "p", value: pickId),
        ]
        message.url = comps.url

        let layout = MSMessageTemplateLayout()
        let senderName = identity?.displayName
        layout.image = BubbleRenderer.render(
            weekNumber: weekNumber, submitted: submitted, total: total,
            lockAt: lockAt, senderName: senderName
        )
        layout.caption = senderName.map { "🏈 \($0) is in — Week \(weekNumber)" }
            ?? "🏈 The Spread — Week \(weekNumber)"
        layout.subcaption = bubbleSubcaption(submitted: submitted, total: total, lockAt: lockAt)
        message.layout = layout
        message.summaryText = "The Spread — Week \(weekNumber)"

        // Extensions cannot send. This stages the bubble in the input field;
        // the player taps send. Two taps, by design — never promise otherwise.
        conv.insert(message)

        if let data = try? NSKeyedArchiver.archivedData(withRootObject: session, requiringSecureCoding: true) {
            SpreadConfig.groupDefaults.set(data, forKey: "msession-\(weekId)")
        }
    }

    private func bubbleSubcaption(submitted: Int, total: Int, lockAt: Date?) -> String {
        if let lockAt, lockAt <= Date() {
            return "Picks are locked — open to see the board"
        }
        return "\(submitted) of \(total) in · \(SpreadFormat.lockLine(lockAt))"
    }
}
