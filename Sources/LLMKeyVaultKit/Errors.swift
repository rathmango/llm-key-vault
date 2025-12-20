import Foundation

public enum LLMKeyVaultError: Error, Sendable {
    case missingAdapter(provider: ProviderID)
    case missingAPIKey(provider: ProviderID)
    case invalidURL(String)
    case httpError(status: Int, message: String)
    case decodingError(String)
    case keychainError(code: Int)
}

extension LLMKeyVaultError: LocalizedError {
    public var errorDescription: String? {
        switch self {
        case .missingAdapter(let provider):
            return "No adapter registered for provider: \(provider.rawValue)"
        case .missingAPIKey(let provider):
            return "Missing API key for provider: \(provider.rawValue)"
        case .invalidURL(let raw):
            return "Invalid URL: \(raw)"
        case .httpError(let status, let message):
            return "HTTP \(status): \(message)"
        case .decodingError(let message):
            return "Decoding error: \(message)"
        case .keychainError(let code):
            return "Keychain error (OSStatus): \(code)"
        }
    }
}
