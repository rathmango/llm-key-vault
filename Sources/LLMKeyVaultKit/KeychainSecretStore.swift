import Foundation
import Security

public struct KeychainSecretStore: SecretStore {
    public let service: String
    public let isSynchronizable: Bool

    public init(service: String, isSynchronizable: Bool = false) {
        self.service = service
        self.isSynchronizable = isSynchronizable
    }

    public func saveSecret(_ secret: String, for ref: SecretKeyRef) throws {
        guard let data = secret.data(using: .utf8) else {
            throw LLMKeyVaultError.decodingError("Failed to encode secret as UTF-8")
        }

        var query = baseQuery(for: ref)
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock

        let status = SecItemAdd(query as CFDictionary, nil)
        if status == errSecDuplicateItem {
            let attributesToUpdate: [String: Any] = [
                kSecValueData as String: data
            ]
            let updateStatus = SecItemUpdate(baseMatchQuery(for: ref) as CFDictionary, attributesToUpdate as CFDictionary)
            guard updateStatus == errSecSuccess else {
                throw LLMKeyVaultError.keychainError(code: Int(updateStatus))
            }
            return
        }

        guard status == errSecSuccess else {
            throw LLMKeyVaultError.keychainError(code: Int(status))
        }
    }

    public func loadSecret(for ref: SecretKeyRef) throws -> String {
        var query = baseMatchQuery(for: ref)
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        query[kSecReturnData as String] = kCFBooleanTrue

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess else {
            throw LLMKeyVaultError.keychainError(code: Int(status))
        }

        guard let data = item as? Data, let value = String(data: data, encoding: .utf8) else {
            throw LLMKeyVaultError.decodingError("Failed to decode secret from Keychain")
        }
        return value
    }

    public func deleteSecret(for ref: SecretKeyRef) throws {
        let status = SecItemDelete(baseMatchQuery(for: ref) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw LLMKeyVaultError.keychainError(code: Int(status))
        }
    }

    // MARK: - Queries

    private func baseQuery(for ref: SecretKeyRef) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: ref.accountName
        ]
        query[kSecAttrSynchronizable as String] = (isSynchronizable ? kCFBooleanTrue : kCFBooleanFalse)
        return query
    }

    private func baseMatchQuery(for ref: SecretKeyRef) -> [String: Any] {
        // For matching existing synchronizable items, Keychain APIs often require either the same
        // synchronizable flag or `kSecAttrSynchronizableAny`.
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: ref.accountName
        ]
        query[kSecAttrSynchronizable as String] = (isSynchronizable ? kCFBooleanTrue : kCFBooleanFalse)
        return query
    }
}
