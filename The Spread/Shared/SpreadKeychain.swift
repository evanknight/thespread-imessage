import Foundation
import Security

struct StoredIdentity: Codable {
    let playerId: String
    let displayName: String
    let token: String
}

/// The enrollment token IS the player's identity — MSConversation's
/// localParticipantIdentifier resets on reinstall and can't be trusted.
/// Stored in the keychain under the app-group access group so the host app
/// and the Messages extension see the same identity.
enum SpreadKeychain {
    private static let service = "thespread.identity"
    private static let account = "player"

    private static var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: SpreadConfig.appGroupID,
        ]
    }

    static func save(_ identity: StoredIdentity) {
        guard let data = try? JSONEncoder().encode(identity) else { return }
        SecItemDelete(baseQuery as CFDictionary)
        var add = baseQuery
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(add as CFDictionary, nil)
    }

    static func load() -> StoredIdentity? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data else { return nil }
        return try? JSONDecoder().decode(StoredIdentity.self, from: data)
    }

    static func clear() {
        SecItemDelete(baseQuery as CFDictionary)
    }
}
