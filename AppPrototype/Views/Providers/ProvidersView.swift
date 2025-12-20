import SwiftUI
import LLMKeyVaultKit

struct ProvidersView: View {
    @EnvironmentObject private var appModel: AppModel

    @State private var apiKeyInput: String = ""
    @State private var statusMessage: String = ""

    var body: some View {
        NavigationSplitView {
            List(ProviderID.allCases.filter { $0 != .custom }, selection: $appModel.selectedProvider) { provider in
                HStack {
                    Text(provider.displayName)
                    Spacer()
                    if appModel.hasKey(for: provider) {
                        Image(systemName: "checkmark.seal.fill")
                            .foregroundStyle(.green)
                    } else {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(.orange)
                    }
                }
            }
            .navigationTitle("Providers")
        } detail: {
            Form {
                Section("API Key") {
                    SecureField("Paste your API key", text: $apiKeyInput)
                        .textContentType(.password)

                    HStack {
                        Button("Save") {
                            do {
                                try appModel.saveKey(apiKeyInput, for: appModel.selectedProvider)
                                apiKeyInput = ""
                                statusMessage = "Saved."
                            } catch {
                                statusMessage = "Save failed: \(error.localizedDescription)"
                            }
                        }

                        Button("Delete", role: .destructive) {
                            do {
                                try appModel.deleteKey(for: appModel.selectedProvider)
                                statusMessage = "Deleted."
                            } catch {
                                statusMessage = "Delete failed: \(error.localizedDescription)"
                            }
                        }
                    }

                    if !statusMessage.isEmpty {
                        Text(statusMessage)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Defaults") {
                    TextField(
                        "Default model",
                        text: Binding(
                            get: { appModel.preferredModels[appModel.selectedProvider] ?? "" },
                            set: { appModel.preferredModels[appModel.selectedProvider] = $0 }
                        )
                    )
                }
            }
            .navigationTitle(appModel.selectedProvider.displayName)
        }
    }
}
