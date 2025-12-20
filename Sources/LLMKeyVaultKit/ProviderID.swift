import Foundation

public enum ProviderID: String, CaseIterable, Codable, Sendable, Identifiable {
    case openai
    case anthropic
    case gemini
    case openrouter
    case ollama
    case custom

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .openai: return "OpenAI"
        case .anthropic: return "Anthropic"
        case .gemini: return "Google Gemini"
        case .openrouter: return "OpenRouter"
        case .ollama: return "Ollama"
        case .custom: return "Custom"
        }
    }
}
