import XCTest
@testable import Wattelier

final class ConnectionTokenTests: XCTestCase {
    func testParsesServerGeneratedToken() throws {
        let token = makeToken(url: "https://wattelier.example.net", accessToken: "se_" + String(repeating: "a", count: 43))

        let connection = try ConnectionToken.parse(token)

        XCTAssertEqual(connection.serverURL.absoluteString, "https://wattelier.example.net")
        XCTAssertEqual(connection.accessToken, "se_" + String(repeating: "a", count: 43))
    }

    func testRejectsMalformedToken() {
        XCTAssertThrowsError(try ConnectionToken.parse("wtl1_pas-du-json"))
    }

    func testRejectsInsecureServer() {
        let token = makeToken(url: "http://wattelier.example.net", accessToken: "se_" + String(repeating: "b", count: 43))
        XCTAssertThrowsError(try ConnectionToken.parse(token)) { error in
            XCTAssertEqual(error as? ConnectionTokenError, .insecure)
        }
    }

    private func makeToken(url: String, accessToken: String) -> String {
        let payload = try! JSONSerialization.data(withJSONObject: ["v": 1, "u": url, "t": accessToken])
        return "wtl1_" + payload.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
