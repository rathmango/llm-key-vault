import Foundation

public protocol ProviderAdapter: Sendable {
    var id: ProviderID { get }
    var defaultBaseURL: URL { get }

    func send(request: ChatRequest, apiKey: String, baseURL: URL?) async throws -> ChatResponse
}
