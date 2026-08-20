import Foundation

/// Last-known week board, cached in the app group so compact mode renders
/// instantly and offline. Extensions get killed abruptly — keep this tiny.
enum SpreadCache {
    private static let weekKey = "cached_week_response"
    private static let dateKey = "cached_week_at"

    static func save(_ week: WeekResponse) {
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        if let data = try? enc.encode(week) {
            SpreadConfig.groupDefaults.set(data, forKey: weekKey)
            SpreadConfig.groupDefaults.set(Date(), forKey: dateKey)
        }
    }

    static func load() -> WeekResponse? {
        guard let data = SpreadConfig.groupDefaults.data(forKey: weekKey) else { return nil }
        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601
        return try? dec.decode(WeekResponse.self, from: data)
    }

    static var lastFetched: Date? {
        SpreadConfig.groupDefaults.object(forKey: dateKey) as? Date
    }
}
