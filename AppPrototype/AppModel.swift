import Foundation
import LLMKeyVaultKit

@MainActor
final class AppModel: ObservableObject {
    @Published var selectedProvider: ProviderID = .openai
    @Published var preferredModels: [ProviderID: String] = [
        .openai: "gpt-4o-mini",
        .anthropic: "claude-3-5-sonnet-20241022"
    ]

    // NOTE: In a real app, use your bundle identifier.
    private let secretStore: KeychainSecretStore
    let client: LLMClient

    init() {
        let service = Bundle.main.bundleIdentifier ?? "com.mingyu.llmkeyvault"
        self.secretStore = KeychainSecretStore(service: service)
        self.client = LLMClient(secretStore: secretStore, adapters: [OpenAIAdapter(), AnthropicAdapter()])
    }

    func hasKey(for provider: ProviderID) -> Bool {
        do {
            _ = try secretStore.loadSecret(for: SecretKeyRef(provider: provider))
            return true
        } catch {
            return false
        }
    }

    func saveKey(_ key: String, for provider: ProviderID) throws {
        try secretStore.saveSecret(key, for: SecretKeyRef(provider: provider))
    }

    func deleteKey(for provider: ProviderID) throws {
        try secretStore.deleteSecret(for: SecretKeyRef(provider: provider))
    }

    func sendChat(provider: ProviderID, model: String, prompt: String) async throws -> ChatResponse {
        let req = ChatRequest(
            provider: provider,
            model: model,
            messages: [ChatMessage(role: .user, content: prompt)]
        )
        return try await client.send(req)
    }
}
