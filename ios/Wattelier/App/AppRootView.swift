import SwiftUI

struct AppRootView: View {
    @EnvironmentObject private var session: AppSession

    var body: some View {
        Group {
            if session.isPresentingWelcome {
                WelcomeView(onFinish: session.finishWelcome)
            } else if session.state == .connected, let repository = session.repository {
                MainNavigationView(repository: repository)
            } else {
                ConnectionView()
            }
        }
        .animation(.easeOut(duration: 0.24), value: session.state)
        .animation(.easeOut(duration: 0.24), value: session.isPresentingWelcome)
    }
}
