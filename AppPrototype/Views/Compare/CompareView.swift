import SwiftUI
import LLMKeyVaultKit

struct CompareView: View {
    var body: some View {
        NavigationStack {
            ContentUnavailableView(
                "Compare (MVP)",
                systemImage: "square.grid.2x2",
                description: Text("멀티 Provider/모델 비교 UI는 다음 스프린트에서 구현합니다.")
            )
            .navigationTitle("Compare")
        }
    }
}
