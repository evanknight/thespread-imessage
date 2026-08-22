import Foundation

enum SpreadAPIError: LocalizedError {
    case notEnrolled
    case locked
    case server(Int, String)

    var errorDescription: String? {
        switch self {
        case .notEnrolled: return "Not enrolled yet — enter your enrollment code."
        case .locked: return "Picks are locked for this week."
        case .server(let code, let msg): return "Server error \(code): \(msg)"
        }
    }
}

struct SpreadAPI {
    static let shared = SpreadAPI()

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        d.dateDecodingStrategy = .custom { dec in
            let s = try dec.singleValueContainer().decode(String.self)
            if let date = fractional.date(from: s) ?? plain.date(from: s) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: dec.codingPath, debugDescription: "bad date: \(s)"))
        }
        return d
    }()

    func enroll(code: String) async throws -> EnrollResponse {
        try await request("POST", "/api/enroll", body: ["code": code], authenticated: false)
    }

    func currentWeek() async throws -> WeekResponse {
        try await request("GET", "/api/week/current")
    }

    func submitPick(weekId: String, gameId: String, teamId: String) async throws -> PickResponse {
        try await request("POST", "/api/pick", body: ["week_id": weekId, "game_id": gameId, "team_id": teamId])
    }

    func pickDetail(id: String) async throws -> PickDetailResponse {
        try await request("GET", "/api/pick/\(id)")
    }

    func standings() async throws -> StandingsResponse {
        try await request("GET", "/api/standings")
    }

    func history(playerId: String? = nil) async throws -> HistoryResponse {
        let path = playerId.map { "/api/history?player_id=\($0)" } ?? "/api/history"
        return try await request("GET", path)
    }

    private func request<T: Decodable>(
        _ method: String, _ path: String,
        body: [String: String]? = nil,
        authenticated: Bool = true
    ) async throws -> T {
        guard let url = URL(string: SpreadConfig.baseURL.absoluteString + path) else {
            throw SpreadAPIError.server(0, "bad URL")
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.timeoutInterval = 15
        if authenticated {
            guard let token = SpreadKeychain.load()?.token else { throw SpreadAPIError.notEnrolled }
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(body)
        }
        let (data, resp) = try await URLSession.shared.data(for: req)
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            if status == 409 { throw SpreadAPIError.locked }
            let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
                ?? String(data: data, encoding: .utf8) ?? "unknown"
            throw SpreadAPIError.server(status, msg)
        }
        return try decoder.decode(T.self, from: data)
    }
}
