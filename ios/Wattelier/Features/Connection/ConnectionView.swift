import SwiftUI
import UIKit

struct ConnectionView: View {
    @EnvironmentObject private var session: AppSession
    @State private var token = ""
    @FocusState private var tokenFocused: Bool

    var body: some View {
        NavigationStack {
            ZStack {
                SignalBackdrop()
                ScrollView {
                    VStack(spacing: 28) {
                        brand
                        VStack(alignment: .leading, spacing: 18) {
                            Text("Accéder à mon serveur")
                                .font(.largeTitle.bold())
                            Text("Collez le jeton de connexion créé dans les réglages de votre serveur Wattelier. Il contient déjà son adresse HTTPS.")
                                .foregroundStyle(.secondary)

                            TextField("Jeton wtl1_…", text: $token, axis: .vertical)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .textContentType(.password)
                                .lineLimit(3...6)
                                .font(.body.monospaced())
                                .padding(14)
                                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                .focused($tokenFocused)
                                .accessibilityLabel("Jeton de connexion Wattelier")

                            HStack {
                                Button("Coller") {
                                    token = UIPasteboard.general.string ?? ""
                                    tokenFocused = false
                                }
                                .buttonStyle(.bordered)
                                Spacer()
                                Label("Stocké dans le trousseau", systemImage: "key.fill")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }

                            if let error = session.connectionError {
                                Label(error, systemImage: "exclamationmark.triangle.fill")
                                    .font(.subheadline)
                                    .foregroundStyle(WattelierTheme.alert)
                                    .accessibilityAddTraits(.isStaticText)
                            }

                            Button {
                                Task { await session.connect(token: token) }
                            } label: {
                                HStack {
                                    if session.state == .connecting { ProgressView().tint(.white) }
                                    Text(session.state == .connecting ? "Connexion…" : "Se connecter")
                                        .frame(maxWidth: .infinity)
                                }
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.large)
                            .disabled(token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || session.state == .connecting)

                            Divider()

                            Button("Découvrir avec des données de démonstration") { session.enterDemo() }
                                .frame(maxWidth: .infinity)
                                .buttonStyle(.bordered)
                                .controlSize(.large)
                        }
                        .frame(maxWidth: 560)
                    }
                    .padding(.horizontal, 24)
                    .padding(.vertical, 42)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
        }
    }

    private var brand: some View {
        VStack(spacing: 14) {
            Image("LaunchMark")
                .resizable()
                .scaledToFit()
                .frame(width: 82, height: 82)
                .accessibilityHidden(true)
            Text("Wattelier")
                .font(.title.weight(.heavy))
                .foregroundStyle(WattelierTheme.accent)
            Text("Votre énergie reste chez vous.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }
}
