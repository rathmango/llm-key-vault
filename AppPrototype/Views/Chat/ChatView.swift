import SwiftUI
import LLMKeyVaultKit

struct ChatView: View {
    @EnvironmentObject private var appModel: AppModel

    @State private var prompt: String = ""
    @State private var responseText: String = ""
    @State private var isSending: Bool = false
    @State private var errorText: String = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Target") {
                    Picker("Provider", selection: $appModel.selectedProvider) {
                        ForEach(ProviderID.allCases.filter { $0 != .custom }) { p in
                            Text(p.displayName).tag(p)
                        }
                    }

                    TextField(
                        "Model",
                        text: Binding(
                            get: { appModel.preferredModels[appModel.selectedProvider] ?? "" },
                            set: { appModel.preferredModels[appModel.selectedProvider] = $0 }
                        )
                    )
                }

                Section("Prompt") {
                    TextEditor(text: $prompt)
                        .frame(minHeight: 120)
                }

                Section {
                    Button(isSending ? "Sending…" : "Send") {
                        isSending = true
                        errorText = ""
                        responseText = ""

                        Task {
                            defer { isSending = false }
                            do {
                                let model = appModel.preferredModels[appModel.selectedProvider] ?? ""
                                let resp = try await appModel.sendChat(provider: appModel.selectedProvider, model: model, prompt: prompt)
                                responseText = resp.text
                            } catch {
                                errorText = error.localizedDescription
                            }
                        }
                    }
                    .disabled(isSending || prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }

                if !errorText.isEmpty {
                    Section("Error") {
                        Text(errorText)
                            .foregroundStyle(.red)
                            .textSelection(.enabled)
                    }
                }

                if !responseText.isEmpty {
                    Section("Response") {
                        Text(responseText)
                            .textSelection(.enabled)
                    }
                }
            }
            .navigationTitle("Chat")
        }
    }
}
