import Foundation

public struct AnthropicAdapter: ProviderAdapter {
    public let id: ProviderID = .anthropic
    public let defaultBaseURL: URL = URL(string: "https://api.anthropic.com")!

    private let http: HTTPClient
    private let anthropicVersion: String

    public init(http: HTTPClient = HTTPClient(), anthropicVersion: String = "2023-06-01") {
        self.http = http
        self.anthropicVersion = anthropicVersion
    }

    public func send(request: ChatRequest, apiKey: String, baseURL: URL?) async throws -> ChatResponse {
        let root = baseURL ?? defaultBaseURL
        let url = root.appendingPathComponent("v1").appendingPathComponent("messages")

        // Anthropic uses a separate `system` field.
        let (system, messages) = splitSystemMessages(request.messages)

        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        urlRequest.setValue(anthropicVersion, forHTTPHeaderField: "anthropic-version")

        let body = AnthropicMessagesBody(
            model: request.model,
            maxTokens: request.maxTokens ?? 1024,
            system: system,
            messages: messages.map { .init(role: $0.role.rawValue, content: $0.content) },
            temperature: request.temperature
        )

        urlRequest.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await http.send(urlRequest)
        guard (200..<300).contains(response.statusCode) else {
            let message = AnthropicErrorResponse.message(from: data) ?? String(data: data, encoding: .utf8) ?? "Unknown error"
            throw LLMKeyVaultError.httpError(status: response.statusCode, message: message)
        }

        do {
            let decoded = try JSONDecoder().decode(AnthropicMessagesResponse.self, from: data)
            let text = decoded.content.first(where: { $0.type == "text" })?.text ?? ""
            let usage = Usage(
                inputTokens: decoded.usage?.inputTokens,
                outputTokens: decoded.usage?.outputTokens,
                totalTokens: nil
            )
            return ChatResponse(text: text, usage: usage)
        } catch {
            throw LLMKeyVaultError.decodingError(String(describing: error))
        }
    }

    private func splitSystemMessages(_ messages: [ChatMessage]) -> (String?, [ChatMessage]) {
        let systemParts = messages.filter { $0.role == .system }.map { $0.content }.filter { !$0.isEmpty }
        let system = systemParts.isEmpty ? nil : systemParts.joined(separator: "\n\n")
        let rest = messages.filter { $0.role != .system }
        return (system, rest)
    }
}

private struct AnthropicMessagesBody: Encodable {
    struct Message: Encodable {
        var role: String
        var content: String
    }

    var model: String
    var maxTokens: Int
    var system: String?
    var messages: [Message]
    var temperature: Double?

    enum CodingKeys: String, CodingKey {
        case model
        case maxTokens = "max_tokens"
        case system
        case messages
        case temperature
    }
}

private struct AnthropicMessagesResponse: Decodable {
    struct Content: Decodable {
        var type: String
        var text: String?
    }

    struct Usage: Decodable {
        var inputTokens: Int?
        var outputTokens: Int?

        enum CodingKeys: String, CodingKey {
            case inputTokens = "input_tokens"
            case outputTokens = "output_tokens"
        }
    }

    var id: String?
    var content: [Content]
    var usage: Usage?
}

private struct AnthropicErrorResponse: Decodable {
    struct ErrorObject: Decodable {
        var message: String?
        var type: String?
    }

    var error: ErrorObject?

    static func message(from data: Data) -> String? {
        (try? JSONDecoder().decode(AnthropicErrorResponse.self, from: data))?.error?.message
    }
}
