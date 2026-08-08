import SwiftUI

struct SettingsView: View {
    let repository: any WattelierRepository
    @EnvironmentObject private var session: AppSession
    @State private var showDisconnect = false

    var body: some View {
        List {
            Section("Connexion") {
                LabeledContent("Serveur", value: repository.displayServer)
                LabeledContent("Transport", value: repository.isDemo ? "Données locales" : "HTTPS chiffré")
                if !repository.isDemo {
                    Label("Le jeton est conservé dans le trousseau de cet appareil.", systemImage: "key.fill")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
            }

            Section("Apparence") {
                Picker("Thème", selection: Binding(
                    get: { session.appearance }, set: { session.appearance = $0 }
                )) {
                    ForEach(AppAppearance.allCases) { appearance in Text(appearance.label).tag(appearance) }
                }
            }

            Section("Confidentialité") {
                Label("Aucun compte Wattelier", systemImage: "person.crop.circle.badge.checkmark")
                Label("Aucun suivi publicitaire", systemImage: "eye.slash.fill")
                Label("Les données restent sur votre serveur", systemImage: "externaldrive.fill.badge.checkmark")
                Link("Politique de confidentialité", destination: URL(string: "https://github.com/N0thyTVOff/wattelier/blob/main/PRIVACY.md")!)
            }

            Section {
                Button(repository.isDemo ? "Quitter la démonstration" : "Oublier ce serveur", role: .destructive) {
                    showDisconnect = true
                }
            } footer: {
                Text("Cette action supprime le jeton de cet appareil. Elle ne modifie ni le serveur ni ses données.")
            }

            Section("À propos") {
                LabeledContent("Application", value: "Wattelier iOS")
                LabeledContent("Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—")
                Link("Code source AGPL-3.0", destination: URL(string: "https://github.com/N0thyTVOff/wattelier")!)
            }
        }
        .navigationTitle("Réglages")
        .confirmationDialog(
            repository.isDemo ? "Quitter la démonstration ?" : "Oublier ce serveur ?",
            isPresented: $showDisconnect, titleVisibility: .visible
        ) {
            Button(repository.isDemo ? "Quitter" : "Oublier le serveur", role: .destructive) { session.disconnect() }
            Button("Annuler", role: .cancel) {}
        }
    }
}

