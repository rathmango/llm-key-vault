import Foundation

public struct OpenAIAdapter: ProviderAdapter {
    public let id: ProviderID = .openai
    public let defaultBaseURL: URL = URL(string: "https://api.openai.com")!

    private let http: HTTPClient

    public init(http: HTTPClient = HTTPClient()) {
        self.http = http
    }

    public func send(request: ChatRequest, apiKey: String, baseURL: URL?) async throws -> ChatResponse {
        let root = baseURL ?? defaultBaseURL
        let url = root.appendingPathComponent("v1").appendingPathComponent("chat").appendingPathComponent("completions")

        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

        let body = OpenAIChatCompletionsBody(
            model: request.model,
            messages: request.messages.map { .init(role: $0.role.rawValue, content: $0.content) },
            temperature: request.temperature,
            maxTokens: request.maxTokens
        )
        urlRequest.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await http.send(urlRequest)
        guard (200..<300).contains(response.statusCode) else {
            let message = OpenAIErrorResponse.message(from: data) ?? String(data: data, encoding: .utf8) ?? "Unknown error"
            throw LLMKeyVaultError.httpError(status: response.statusCode, message: message)
        }

        do {
            let decoded = try JSONDecoder().decode(OpenAIChatCompletionsResponse.self, from: data)
            let text = decoded.choices.first?.message.content ?? ""
            let usage = Usage(
                inputTokens: decoded.usage?.promptTokens,
                outputTokens: decoded.usage?.completionTokens,
                totalTokens: decoded.usage?.totalTokens
            )
            return ChatResponse(text: text, usage: usage)
        } catch {
            throw LLMKeyVaultError.decodingError(String(describing: error))
        }
    }
}

private struct OpenAIChatCompletionsBody: Encodable {
    struct Message: Encodable {
        var role: String
        var content: String
    }

    var model: String
    var messages: [Message]
    var temperature: Double?
    var maxTokens: Int?

    enum CodingKeys: String, CodingKey {
        case model
        case messages
        case temperature
        case maxTokens = "max_tokens"
    }
}

private struct OpenAIChatCompletionsResponse: Decodable {
    struct Choice: Decodable {
        struct Message: Decodable {
            var role: String
            var content: String
        }
        var index: Int
        var message: Message
    }

    struct Usage: Decodable {
        var promptTokens: Int?
        var completionTokens: Int?
        var totalTokens: Int?

        enum CodingKeys: String, CodingKey {
            case promptTokens = "prompt_tokens"
            case completionTokens = "completion_tokens"
            case totalTokens = "total_tokens"
        }
    }

    var choices: [Choice]
    var usage: Usage?
}

private struct OpenAIErrorResponse: Decodable {
    struct ErrorObject: Decodable {
        var message: String?
        var type: String?
        var code: String?
    }
    var error: ErrorObject

    static func message(from data: Data) -> String? {
        (try? JSONDecoder().decode(OpenAIErrorResponse.self, from: data))?.error.message
    }
}
