import SwiftUI

@main
struct WattelierApp: App {
    @StateObject private var session = AppSession()

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .environmentObject(session)
                .tint(WattelierTheme.accent)
                .preferredColorScheme(session.preferredColorScheme)
        }
    }
}

