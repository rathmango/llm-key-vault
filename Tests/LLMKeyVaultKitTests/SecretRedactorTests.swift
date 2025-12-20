#if canImport(XCTest)
import XCTest
@testable import LLMKeyVaultKit

final class SecretRedactorTests: XCTestCase {
    func testMaskKeepsPrefixAndSuffix() {
        let masked = SecretRedactor.mask("sk-1234567890abcdef", keepPrefix: 3, keepSuffix: 4)
        XCTAssertTrue(masked.hasPrefix("sk-"))
        XCTAssertTrue(masked.hasSuffix("cdef"))
        XCTAssertTrue(masked.contains("****"))
    }

    func testRedactReplacesSecrets() {
        let text = "Authorization: Bearer sk-SECRET"
        let out = SecretRedactor.redact(text, secrets: ["sk-SECRET"])
        XCTAssertEqual(out, "Authorization: Bearer [REDACTED]")
    }
}
#endif
