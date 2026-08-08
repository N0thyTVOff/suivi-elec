import SwiftUI

struct AppRootView: View {
    @EnvironmentObject private var session: AppSession

    var body: some View {
        Group {
            if session.state == .connected, let repository = session.repository {
                MainNavigationView(repository: repository)
            } else {
                ConnectionView()
            }
        }
        .animation(.easeOut(duration: 0.24), value: session.state)
        .sheet(isPresented: welcomePresentation) {
            WelcomeView(onFinish: session.finishWelcome)
        }
    }

    private var welcomePresentation: Binding<Bool> {
        Binding(
            get: { session.isPresentingWelcome },
            set: { isPresented in
                if !isPresented { session.finishWelcome() }
            }
        )
    }
}
