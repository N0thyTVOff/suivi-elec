import SwiftUI

@MainActor
final class AppSession: ObservableObject {
    enum State: Equatable {
        case disconnected
        case connecting
        case connected
    }

    @Published private(set) var state: State = .disconnected
    @Published private(set) var repository: (any WattelierRepository)?
    @Published private(set) var connectionError: String?
    @AppStorage("appearance") private var appearanceRaw = AppAppearance.system.rawValue

    var appearance: AppAppearance {
        get { AppAppearance(rawValue: appearanceRaw) ?? .system }
        set { appearanceRaw = newValue.rawValue; objectWillChange.send() }
    }

    var preferredColorScheme: ColorScheme? {
        switch appearance {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }

    init() {
        if ProcessInfo.processInfo.arguments.contains("-uitesting-demo") {
            repository = DemoRepository()
            state = .connected
            return
        }
        if let token = KeychainStore.load() {
            Task { await connect(token: token, persist: false) }
        }
    }

    func connect(token: String, persist: Bool = true) async {
        state = .connecting
        connectionError = nil
        do {
            let connection = try ConnectionToken.parse(token)
            let live = LiveRepository(connection: connection)
            try await live.validate()
            if persist { try KeychainStore.save(token: token.trimmingCharacters(in: .whitespacesAndNewlines)) }
            repository = live
            state = .connected
        } catch {
            repository = nil
            state = .disconnected
            connectionError = error.localizedDescription
        }
    }

    func enterDemo() {
        connectionError = nil
        repository = DemoRepository()
        state = .connected
    }

    func disconnect() {
        KeychainStore.delete()
        repository = nil
        connectionError = nil
        state = .disconnected
    }
}
