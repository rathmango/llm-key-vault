import SwiftUI
import LLMKeyVaultKit

struct RootView: View {
    var body: some View {
        TabView {
            ProvidersView()
                .tabItem { Label("Providers", systemImage: "key") }

            ChatView()
                .tabItem { Label("Chat", systemImage: "bubble.left.and.bubble.right") }

            CompareView()
                .tabItem { Label("Compare", systemImage: "square.grid.2x2") }

            SettingsView()
                .tabItem { Label("Settings", systemImage: "gear") }
        }
    }
}
