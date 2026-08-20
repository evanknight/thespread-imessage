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
    let gameId: String
    let teamId: String
    let teamAbbr: String?
    let submittedAt: Date?
    let updatedAt: Date?
}

struct PickDetail: Codable {
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
    var id: String { playerId }
}

struct WeekResultRow: Codable, Identifiable {
    let weekId: String
    let weekNumber: Int
    let round: String
    let playerId: String
    let displayName: String
    let pickedTeam: String?
    let officialSpread: Double?
    let lockTimeSpread: Double?
    let totalPoints: Double?
    let outcome: String?
    var id: String { weekId + playerId }
}

struct StandingsResponse: Codable {
    let season: Int
    let standings: [StandingRow]
    let weeks: [WeekResultRow]
}

struct HistoryRow: Codable, Identifiable {
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

    static func lockLine(_ d: Date?) -> String {
        guard let d else { return "lock TBD" }
        let f = DateFormatter()
        f.dateFormat = "EEE h:mm a"
        if d < Date() { return "locked" }
        return "locks \(f.string(from: d))"
    }
}
