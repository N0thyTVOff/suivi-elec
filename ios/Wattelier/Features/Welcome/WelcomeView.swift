import SwiftUI

struct WelcomeView: View {
    let onFinish: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 34) {
                    header
                    features
                    privacyNote
                }
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 28)
                .padding(.top, 18)
                .padding(.bottom, 28)
            }
            .scrollIndicators(.hidden)
            .safeAreaInset(edge: .bottom) {
                continueAction
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: onFinish) {
                        Image(systemName: "xmark.circle.fill")
                            .symbolRenderingMode(.hierarchical)
                            .font(.title2)
                    }
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("Fermer la présentation")
                    .accessibilityHint("Ouvre l’écran de connexion")
                }
            }
            .toolbarBackground(.hidden, for: .navigationBar)
        }
        .tint(WattelierTheme.accent)
        .presentationDetents([.large])
        .presentationDragIndicator(.hidden)
    }

    private var header: some View {
        VStack(spacing: 18) {
            Image("LaunchMark")
                .resizable()
                .scaledToFit()
                .frame(width: 88, height: 88)
                .accessibilityHidden(true)

            VStack(spacing: 10) {
                Text("Bienvenue dans Wattelier")
                    .font(.largeTitle.weight(.bold))
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)

                Text("Votre énergie, enfin claire — directement depuis votre propre serveur.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var features: some View {
        VStack(alignment: .leading, spacing: 26) {
            WelcomeFeature(
                symbol: "chart.xyaxis.line",
                tint: WattelierTheme.accent,
                title: "Des mesures qui restent justes",
                detail: "La maison et les prises sont présentées séparément, avec leur source et leur fraîcheur."
            )
            WelcomeFeature(
                symbol: "bolt.horizontal.circle.fill",
                tint: WattelierTheme.success,
                title: "Le direct et les commandes",
                detail: "Suivez la puissance des prises et pilotez les appareils compatibles depuis votre iPhone."
            )
            WelcomeFeature(
                symbol: "lock.shield.fill",
                tint: .indigo,
                title: "Vos données restent chez vous",
                detail: "Aucun compte Wattelier : la connexion HTTPS et le trousseau iOS protègent votre accès."
            )
        }
    }

    private var privacyNote: some View {
        Text("Vous pourrez revoir cette présentation à tout moment depuis Réglages.")
            .font(.footnote)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var continueAction: some View {
        VStack(spacing: 10) {
            Button("Continuer", action: onFinish)
                .font(.headline)
                .frame(maxWidth: .infinity, minHeight: 52)
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.roundedRectangle(radius: 14))

            Text("La configuration prend moins d’une minute.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: 560)
        .padding(.horizontal, 24)
        .padding(.top, 14)
        .padding(.bottom, 10)
        .background(.bar)
    }
}

private struct WelcomeFeature: View {
    let symbol: String
    let tint: Color
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: 18) {
            Image(systemName: symbol)
                .font(.title2.weight(.semibold))
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(tint)
                .frame(width: 36)
                .frame(minHeight: 44, alignment: .top)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 5) {
                Text(title)
                    .font(.headline)
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
