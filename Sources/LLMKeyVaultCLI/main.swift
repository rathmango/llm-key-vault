import Foundation
import LLMKeyVaultKit

@main
struct LLMKeyVaultCLI {
    static func main() async {
        let args = CommandLine.arguments
        guard args.count >= 2 else {
            printUsage()
            return
        }

        let command = args[1]
        let store = KeychainSecretStore(service: "com.mingyu.llmkeyvault")
        let client = LLMClient(secretStore: store, adapters: [OpenAIAdapter(), AnthropicAdapter()])

        switch command {
        case "set-key":
            // llmkv set-key <provider> <apiKey>
            guard args.count >= 4 else { printUsage(); return }
            guard let provider = ProviderID(rawValue: args[2].lowercased()) else {
                print("Unknown provider: \(args[2])")
                return
            }
            let key = args[3]
            do {
                try store.saveSecret(key, for: SecretKeyRef(provider: provider))
                print("Saved key for \(provider.displayName): \(SecretRedactor.mask(key))")
            } catch {
                print("Failed to save key: \(error.localizedDescription)")
            }

        case "delete-key":
            // llmkv delete-key <provider>
            guard args.count >= 3 else { printUsage(); return }
            guard let provider = ProviderID(rawValue: args[2].lowercased()) else {
                print("Unknown provider: \(args[2])")
                return
            }
            do {
                try store.deleteSecret(for: SecretKeyRef(provider: provider))
                print("Deleted key for \(provider.displayName)")
            } catch {
                print("Failed to delete key: \(error.localizedDescription)")
            }

        case "chat":
            // llmkv chat <provider> <model> <prompt>
            guard args.count >= 5 else { printUsage(); return }
            guard let provider = ProviderID(rawValue: args[2].lowercased()) else {
                print("Unknown provider: \(args[2])")
                return
            }
            let model = args[3]
            let prompt = args.dropFirst(4).joined(separator: " ")

            do {
                let req = ChatRequest(
                    provider: provider,
                    model: model,
                    messages: [ChatMessage(role: .user, content: prompt)]
                )
                let resp = try await client.send(req)
                print(resp.text)
            } catch {
                print("Error: \(error.localizedDescription)")
            }

        case "compare":
            // llmkv compare <prompt>
            guard args.count >= 3 else { printUsage(); return }
            let prompt = args.dropFirst(2).joined(separator: " ")

            let results = await client.compare(
                prompt: prompt,
                targets: [
                    (provider: .openai, model: "gpt-4o-mini"),
                    (provider: .anthropic, model: "claude-3-5-sonnet-20241022")
                ]
            )

            for r in results {
                print("\n=== \(r.provider.displayName) / \(r.model) ===")
                switch r.result {
                case .success(let resp):
                    print(resp.text)
                case .failure(let err):
                    print("FAILED: \(err.localizedDescription)")
                }
            }

        default:
            printUsage()
        }
    }

    private static func printUsage() {
        print(
"""
Usage:
  llmkv set-key <provider> <apiKey>
  llmkv delete-key <provider>
  llmkv chat <provider> <model> <prompt>
  llmkv compare <prompt>

Providers:
  openai | anthropic | gemini | openrouter | ollama | custom

Examples:
  llmkv set-key openai sk-... 
  llmkv chat openai gpt-4o-mini "Hello"
"""
        )
    }
}
