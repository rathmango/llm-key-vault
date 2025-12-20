import SwiftUI

struct SettingsView: View {
    var body: some View {
        NavigationStack {
            Form {
                Section("Security") {
                    Text("MVP: 키는 Keychain에 저장되며, UI에서는 기본적으로 노출하지 않습니다.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Platform") {
                    Text("macOS + iPadOS 지원")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
        }
    }
}
