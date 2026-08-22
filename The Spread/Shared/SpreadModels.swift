import Foundation

// Mirrors of the Vercel API JSON. Decoded with .convertFromSnakeCase.

struct WeekMeta: Codable {
    let id: String
    let weekNumber: Int
    let round: String
    let lockAt: Date?
    let locked: Bool
    let playoffBonus: Double?
}

struct TeamSide: Codable {
    let teamId: String
    let abbr: String
    let name: String
    let score: Int?
    let spread: Double?
}

struct Game: Codable, Identifiable {
    let id: String
    let kickoffAt: Date
    let status: String
    let home: TeamSide
    let away: TeamSide
    let winnerTeamId: String?
    let spreadCapturedAt: Date?
}

struct MyPick: Codable {
    let pickId: String?
    let gameId: String
    let teamId: String
    let teamAbbr: String?
    let submittedAt: Date?
    let updatedAt: Date?
}

struct PickDetail: Codable {
    let pickId: String?
    let gameId: String?
    let teamId: String?
    let teamAbbr: String?
    let officialSpread: Double?
    let lockTimeSpread: Double?
    let basePoints: Double?
    let bonusPoints: Double?
    let totalPoints: Double?
    let outcome: String?
}

struct PlayerRow: Codable, Identifiable {
    let playerId: String
    let displayName: String
    let hasPicked: Bool
    let pick: PickDetail?
    var id: String { playerId }
}

struct WeekResponse: Codable {
    let linesUpdatedAt: Date?
    let week: WeekMeta
    let games: [Game]
    let myPick: MyPick?
    let submittedCount: Int
    let playerCount: Int
    let players: [PlayerRow]
}

struct PickRow: Codable {
    let id: String
    let gameId: String
    let teamId: String
    let submittedAt: Date?
    let updatedAt: Date?
}

struct PickResponse: Codable {
    let pick: PickRow
    let weekNumber: Int
    let lockAt: Date?
    let submittedCount: Int
    let playerCount: Int
}

struct EnrollResponse: Codable {
    let playerId: String
    let displayName: String
    let token: String
}

struct StandingRow: Codable, Identifiable {
    let playerId: String
    let displayName: String
    let totalPoints: Double
    let wins: Int
    let losses: Int
    let picksMade: Int
    let streak: String?
    var id: String { playerId }
}

struct WeekResultRow: Codable, Identifiable {
    let weekId: String
    let pickId: String?
    let weekNumber: Int
    let round: String
    let playerId: String
    let displayName: String
    let pickedTeam: String?
    let officialSpread: Double?
    let lockTimeSpread: Double?
    let totalPoints: Double?
    let outcome: String?
    let homeAbbr: String?
    let awayAbbr: String?
    let homeScore: Int?
    let awayScore: Int?
    let gameStatus: String?
    var id: String { weekId + playerId }
}

struct StandingsResponse: Codable {
    let season: Int
    let standings: [StandingRow]
    let weeks: [WeekResultRow]
}

struct HistoryRow: Codable, Identifiable {
    let pickId: String?
    let weekNumber: Int
    let round: String
    let pickedTeam: String?
    let officialSpread: Double?
    let lockTimeSpread: Double?
    let basePoints: Double?
    let bonusPoints: Double?
    let totalPoints: Double?
    let outcome: String?
    let kickoffAt: Date?
    let status: String?
    let homeScore: Int?
    let awayScore: Int?
    let homeAbbr: String?
    let awayAbbr: String?
    var id: Int { weekNumber }
}

struct HistoryResponse: Codable {
    let playerId: String
    let picks: [HistoryRow]
}

enum SpreadFormat {
    /// "+3.5" / "-2.5" / "PK" for zero, "—" for unknown.
    static func spread(_ v: Double?) -> String {
        guard let v else { return "—" }
        if v == 0 { return "PK" }
        let s = points(v)
        return v > 0 ? "+\(s)" : s
    }

    /// Trims trailing ".0": 7.5 -> "7.5", 13 -> "13", -0.5 -> "-0.5".
    static func points(_ v: Double) -> String {
        v == v.rounded() ? String(Int(v)) : String(v)
    }

    /// "Los Angeles Rams" -> "RAMS". Last word works for all 32 teams.
    static func nickname(_ fullName: String) -> String {
        (fullName.components(separatedBy: " ").last ?? fullName).uppercased()
    }

    /// "3 min ago" / "2 hr ago" — for the lines-freshness note.
    static func ago(_ d: Date?) -> String {
        guard let d else { return "not yet" }
        let secs = Int(Date().timeIntervalSince(d))
        if secs < 90 { return "just now" }
        if secs < 3600 { return "\(secs / 60) min ago" }
        if secs < 86400 { return "\(secs / 3600) hr ago" }
        return "\(secs / 86400)d ago"
    }

    /// "locks Wed 8:20 PM (Sep 9)" — the date matters when the deadline is
    /// weeks out, not just which weekday.
    static func lockLine(_ d: Date?) -> String {
        guard let d else { return "lock TBD" }
        if d < Date() { return "locked" }
        let time = DateFormatter(); time.dateFormat = "EEE h:mm a"
        let day = DateFormatter(); day.dateFormat = "MMM d"
        return "locks \(time.string(from: d)) (\(day.string(from: d)))"
    }
}

// MARK: - Pick detail (GET /api/pick/{id})

struct LinePoint: Codable, Identifiable {
    let snapshotId: String?
    let capturedAt: Date?
    let spread: Double?
    var id: String { (snapshotId ?? "") + (capturedAt?.description ?? "") }
}

struct LineDetail: Codable {
    let open: LinePoint?
    let atLock: LinePoint?
    let official: LinePoint?
    let current: LinePoint?
    let deltaLockToKickoff: Double?
    let deltaOpenToNow: Double?
    let series: [LinePoint]
    let sampleCount: Int
}

struct PickInfo: Codable {
    let id: String
    let playerId: String
    let displayName: String
    let teamId: String
    let teamAbbr: String
    let teamName: String
    let submittedAt: Date?
    let updatedAt: Date?
    let changeCount: Int
    let isMine: Bool
}

struct GameInfo: Codable {
    let id: String
    let kickoffAt: Date?
    let status: String
    let homeAbbr: String
    let homeName: String
    let homeScore: Int?
    let awayAbbr: String
    let awayName: String
    let awayScore: Int?
    let winnerAbbr: String?
    let pickedIsHome: Bool
}

struct ResultInfo: Codable {
    let outcome: String
    let basePoints: Double?
    let bonusPoints: Double?
    let totalPoints: Double?
    let scoredAt: Date?
    let note: String?
}

struct PickDetailResponse: Codable {
    let pick: PickInfo
    let week: WeekMeta2
    let game: GameInfo
    let line: LineDetail
    let result: ResultInfo?
    let potentialPoints: Double?
}

/// week block of the detail payload (subset of WeekMeta, no id)
struct WeekMeta2: Codable {
    let weekNumber: Int
    let round: String
    let lockAt: Date?
    let locked: Bool
    let playoffBonus: Double?
}
