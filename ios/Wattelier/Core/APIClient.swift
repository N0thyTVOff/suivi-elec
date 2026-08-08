import Foundation

enum APIError: LocalizedError {
    case invalidResponse
    case unauthorized
    case server(String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse: "Le serveur Wattelier a renvoyé une réponse illisible."
        case .unauthorized: "Le jeton a été refusé ou révoqué. Créez un nouveau jeton sur le serveur."
        case .server(let message): message
        }
    }
}

final class APIClient: @unchecked Sendable {
    let connection: ServerConnection
    private let session: URLSession
    private let decoder = JSONDecoder()

    init(connection: ServerConnection, session: URLSession = .shared) {
        self.connection = connection
        self.session = session
    }

    func request<Response: Decodable>(
        _ path: String,
        method: String = "GET",
        body: Data? = nil
    ) async throws -> Response {
        let apiRoot = connection.serverURL.appending(path: "api", directoryHint: .isDirectory)
        guard let url = URL(string: path, relativeTo: apiRoot)?.absoluteURL else {
            throw APIError.invalidResponse
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        request.timeoutInterval = 20
        request.setValue("Bearer \(connection.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if http.statusCode == 401 { throw APIError.unauthorized }
        guard 200..<300 ~= http.statusCode else {
            let message = (try? JSONDecoder().decode(ServerError.self, from: data).error)
                ?? "Le serveur a répondu avec l’erreur \(http.statusCode)."
            throw APIError.server(message)
        }
        do { return try decoder.decode(Response.self, from: data) }
        catch { throw APIError.invalidResponse }
    }

    func requestNoContent(_ path: String, method: String, body: Data? = nil) async throws {
        let _: EmptyResponse = try await request(path, method: method, body: body)
    }
}

private struct ServerError: Decodable { let error: String }
private struct EmptyResponse: Decodable { let ok: Bool? }
