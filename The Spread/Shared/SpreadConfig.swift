import Foundation

enum SpreadConfig {
    /// Shared container between the host app and the Messages extension.
    static let appGroupID = "group.evanknight.thespread"

    /// Production API. Point this at the deployed Vercel app.
    /// Override at runtime (Settings tab in the host app) via "api_base_url".
    static let defaultBaseURL = URL(string: "https://thespread-imessage.vercel.app")!

    static var groupDefaults: UserDefaults {
        UserDefaults(suiteName: appGroupID) ?? .standard
    }

    static var baseURL: URL {
        if let s = groupDefaults.string(forKey: "api_base_url"),
           !s.isEmpty, let u = URL(string: s) {
            return u
        }
        return defaultBaseURL
    }
}
