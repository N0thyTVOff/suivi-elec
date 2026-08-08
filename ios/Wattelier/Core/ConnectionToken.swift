import Foundation

struct ServerConnection: Codable, Equatable, Sendable {
    let serverURL: URL
    let accessToken: String
}

enum ConnectionTokenError: LocalizedError, Equatable {
    case invalid
    case insecure

    var errorDescription: String? {
        switch self {
        case .invalid: "Jeton de connexion invalide. Créez-en un nouveau depuis Wattelier sur le serveur."
        case .insecure: "Le serveur doit utiliser une adresse HTTPS."
        }
    }
}

enum ConnectionToken {
    private struct Payload: Decodable {
        let v: Int
        let u: String
        let t: String
    }

    static func parse(_ value: String) throws -> ServerConnection {
        let token = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard token.hasPrefix("wtl1_"), token.count <= 2048 else { throw ConnectionTokenError.invalid }
        var encoded = String(token.dropFirst(5)).replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        encoded += String(repeating: "=", count: (4 - encoded.count % 4) % 4)
        guard let data = Data(base64Encoded: encoded),
              let payload = try? JSONDecoder().decode(Payload.self, from: data),
              payload.v == 1,
              payload.t.range(of: #"^se_[A-Za-z0-9_-]{43}$"#, options: .regularExpression) != nil,
              let url = URL(string: payload.u),
              url.user == nil,
              url.password == nil,
              url.query == nil,
              url.fragment == nil,
              url.path.isEmpty || url.path == "/"
        else { throw ConnectionTokenError.invalid }
        guard url.scheme == "https" else { throw ConnectionTokenError.insecure }
        return ServerConnection(serverURL: url, accessToken: payload.t)
    }
}
