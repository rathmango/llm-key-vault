import Foundation

public enum ChatRole: String, Codable, Sendable {
    case system
    case user
    case assistant
}

public struct ChatMessage: Codable, Hashable, Sendable {
    public var role: ChatRole
    public var content: String

    public init(role: ChatRole, content: String) {
        self.role = role
        self.content = content
    }
}

public struct ChatRequest: Codable, Hashable, Sendable {
    public var provider: ProviderID
    public var model: String
    public var messages: [ChatMessage]
    public var temperature: Double?
    public var maxTokens: Int?

    public init(
        provider: ProviderID,
        model: String,
        messages: [ChatMessage],
        temperature: Double? = nil,
        maxTokens: Int? = nil
    ) {
        self.provider = provider
        self.model = model
        self.messages = messages
        self.temperature = temperature
        self.maxTokens = maxTokens
    }
}

public struct Usage: Codable, Hashable, Sendable {
    public var inputTokens: Int?
    public var outputTokens: Int?
    public var totalTokens: Int?

    public init(inputTokens: Int? = nil, outputTokens: Int? = nil, totalTokens: Int? = nil) {
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
        self.totalTokens = totalTokens
    }
}

public struct ChatResponse: Codable, Hashable, Sendable {
    public var text: String
    public var usage: Usage?

    public init(text: String, usage: Usage? = nil) {
        self.text = text
        self.usage = usage
    }
}
