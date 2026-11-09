import CommonCrypto
import Foundation
import Security

// Same as PasswordUtil.kt on Android: PBKDF2 (HMAC-SHA256), 120 000 rounds,
// a random 16-byte salt per user, 256-bit hash, both stored as Base64.
enum PasswordUtil {
    private static let iterations: UInt32 = 120_000
    private static let keyLength = 32

    static func createDigest(_ password: String) -> (salt: String, hash: String) {
        var salt = [UInt8](repeating: 0, count: 16)
        _ = SecRandomCopyBytes(kSecRandomDefault, salt.count, &salt)
        return (Data(salt).base64EncodedString(), Data(derive(password, salt)).base64EncodedString())
    }

    static func verify(_ password: String, salt: String, hash: String) -> Bool {
        guard let saltData = Data(base64Encoded: salt), let expected = Data(base64Encoded: hash) else { return false }
        let actual = derive(password, [UInt8](saltData))
        guard actual.count == expected.count else { return false }
        // Constant-time comparison: always looks at every byte
        var difference: UInt8 = 0
        for (a, b) in zip(actual, expected) {
            difference |= a ^ b
        }
        return difference == 0
    }

    private static func derive(_ password: String, _ salt: [UInt8]) -> [UInt8] {
        var key = [UInt8](repeating: 0, count: keyLength)
        _ = CCKeyDerivationPBKDF(
            CCPBKDFAlgorithm(kCCPBKDF2),
            password, password.utf8.count,
            salt, salt.count,
            CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256),
            iterations,
            &key, key.count
        )
        return key
    }
}
