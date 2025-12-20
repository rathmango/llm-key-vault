import Foundation

public struct SecretKeyRef: Hashable, Codable, Sendable {
    public var provider: ProviderID
    public var name: String

    public init(provider: ProviderID, name: String = "default") {
        self.provider = provider
        self.name = name
    }

    public var accountName: String {
        "\(provider.rawValue):\(name)"
    }
}

public protocol SecretStore: Sendable {
    func saveSecret(_ secret: String, for ref: SecretKeyRef) throws
    func loadSecret(for ref: SecretKeyRef) throws -> String
    func deleteSecret(for ref: SecretKeyRef) throws
}

public enum SecretRedactor {
    /// Returns masked representation safe for UI/logs (e.g., "sk-****c0f1").
    public static func mask(_ secret: String, keepPrefix: Int = 3, keepSuffix: Int = 4) -> String {
        guard !secret.isEmpty else { return "" }
        let prefix = String(secret.prefix(keepPrefix))
        let suffix = String(secret.suffix(keepSuffix))
        return "\(prefix)****\(suffix)"
    }

    /// Redacts known secrets from arbitrary text.
    public static func redact(_ text: String, secrets: [String]) -> String {
        var out = text
        for s in secrets where !s.isEmpty {
            out = out.replacingOccurrences(of: s, with: "[REDACTED]")
        }
        return out
    }
}
