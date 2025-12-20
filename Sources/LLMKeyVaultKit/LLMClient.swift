import Foundation

public actor LLMClient {
    private let secretStore: any SecretStore
    private var adapters: [ProviderID: any ProviderAdapter]

    public init(secretStore: any SecretStore, adapters: [any ProviderAdapter]) {
        self.secretStore = secretStore
        var map: [ProviderID: any ProviderAdapter] = [:]
        for a in adapters {
            map[a.id] = a
        }
        self.adapters = map
    }

    public func register(adapter: any ProviderAdapter) {
        adapters[adapter.id] = adapter
    }

    public func send(_ request: ChatRequest, keyName: String = "default", baseURL: URL? = nil) async throws -> ChatResponse {
        guard let adapter = adapters[request.provider] else {
            throw LLMKeyVaultError.missingAdapter(provider: request.provider)
        }

        let ref = SecretKeyRef(provider: request.provider, name: keyName)
        let apiKey: String
        do {
            apiKey = try secretStore.loadSecret(for: ref)
        } catch {
            throw LLMKeyVaultError.missingAPIKey(provider: request.provider)
        }

        return try await adapter.send(request: request, apiKey: apiKey, baseURL: baseURL)
    }

    public func compare(
        prompt: String,
        targets: [(provider: ProviderID, model: String)],
        temperature: Double? = nil,
        maxTokens: Int? = nil
    ) async -> [(provider: ProviderID, model: String, result: Result<ChatResponse, Error>)] {
        let baseMessages = [ChatMessage(role: .user, content: prompt)]

        return await withTaskGroup(of: (ProviderID, String, Result<ChatResponse, Error>).self) { group in
            for t in targets {
                group.addTask {
                    let req = ChatRequest(provider: t.provider, model: t.model, messages: baseMessages, temperature: temperature, maxTokens: maxTokens)
                    do {
                        let resp = try await self.send(req)
                        return (t.provider, t.model, .success(resp))
                    } catch {
                        return (t.provider, t.model, .failure(error))
                    }
                }
            }

            var results: [(ProviderID, String, Result<ChatResponse, Error>)] = []
            for await r in group {
                results.append(r)
            }
            return results
        }
    }
}
