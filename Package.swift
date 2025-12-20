// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "LLMKeyVault",
    platforms: [
        .iOS(.v16),
        .macOS(.v13)
    ],
    products: [
        .library(
            name: "LLMKeyVaultKit",
            targets: ["LLMKeyVaultKit"]
        ),
        .executable(
            name: "llmkv",
            targets: ["LLMKeyVaultCLI"]
        )
    ],
    dependencies: [
        // Intentionally empty (no third-party deps for MVP).
    ],
    targets: [
        .target(
            name: "LLMKeyVaultKit",
            dependencies: []
        ),
        .executableTarget(
            name: "LLMKeyVaultCLI",
            dependencies: ["LLMKeyVaultKit"]
        ),
        .testTarget(
            name: "LLMKeyVaultKitTests",
            dependencies: ["LLMKeyVaultKit"]
        )
    ]
)
