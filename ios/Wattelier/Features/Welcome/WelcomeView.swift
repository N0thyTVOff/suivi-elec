import SwiftUI

struct WelcomeView: View {
    let onFinish: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var selection = 0

    private let pages = WelcomePage.all

    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()
            SignalBackdrop()

            VStack(spacing: 0) {
                header

                TabView(selection: $selection) {
                    ForEach(Array(pages.enumerated()), id: \.element.id) { index, page in
                        WelcomeCard(page: page)
                            .tag(index)
                            .padding(.horizontal, 20)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .accessibilityLabel("Présentation de Wattelier")

                footer
            }
            .frame(maxWidth: 680)
        }
        .tint(WattelierTheme.accent)
    }

    private var header: some View {
        HStack(spacing: 12) {
            Image("LaunchMark")
                .resizable()
                .scaledToFit()
                .frame(width: 36, height: 36)
                .accessibilityHidden(true)

            Text("Wattelier")
                .font(.headline.weight(.bold))

            Spacer()

            Button("Ignorer", action: onFinish)
                .font(.body.weight(.semibold))
                .frame(minWidth: 44, minHeight: 44)
                .accessibilityHint("Ouvre directement l’écran de connexion")
        }
        .padding(.horizontal, 24)
        .padding(.top, 8)
    }

    private var footer: some View {
        VStack(spacing: 20) {
            HStack(spacing: 8) {
                ForEach(pages.indices, id: \.self) { index in
                    Capsule(style: .continuous)
                        .fill(index == selection ? WattelierTheme.accent : Color.secondary.opacity(0.25))
                        .frame(width: index == selection ? 26 : 8, height: 8)
                }
            }
            .animation(reduceMotion ? nil : .snappy(duration: 0.3), value: selection)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Progression")
            .accessibilityValue("Page \(selection + 1) sur \(pages.count)")

            Button {
                if selection == pages.count - 1 {
                    onFinish()
                } else {
                    withAnimation(reduceMotion ? nil : .snappy(duration: 0.38)) {
                        selection += 1
                    }
                }
            } label: {
                HStack(spacing: 10) {
                    Text(selection == pages.count - 1 ? "Se connecter à mon serveur" : "Suivant")
                    Image(systemName: selection == pages.count - 1 ? "arrow.right.circle.fill" : "arrow.right")
                        .accessibilityHidden(true)
                }
                .font(.headline)
                .frame(maxWidth: .infinity, minHeight: 52)
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.roundedRectangle(radius: 14))
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 18)
    }
}

private struct WelcomeCard: View {
    let page: WelcomePage

    var body: some View {
        ScrollView {
            VStack(spacing: 28) {
                Spacer(minLength: 18)

                WelcomeArtwork(page: page)

                VStack(spacing: 14) {
                    Text(page.title)
                        .font(.largeTitle.weight(.bold))
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)

                    Text(page.detail)
                        .font(.title3)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Label(page.proof, systemImage: "checkmark.circle.fill")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(page.tint)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)

                Spacer(minLength: 18)
            }
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
        }
        .scrollIndicators(.hidden)
        .accessibilityElement(children: .contain)
    }
}

private struct WelcomeArtwork: View {
    let page: WelcomePage

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 32, style: .continuous)
                .fill(page.tint.opacity(0.12))

            Circle()
                .fill(page.tint.opacity(0.12))
                .frame(width: 148, height: 148)

            Image(systemName: page.symbol)
                .font(.system(size: 68, weight: .medium))
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(page.tint)

            SignalPulseShape()
                .trim(from: 0.08, to: 0.92)
                .stroke(page.tint.opacity(0.55), style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
                .frame(height: 34)
                .padding(.horizontal, 28)
                .offset(y: 82)
        }
        .frame(maxWidth: 420)
        .aspectRatio(1.35, contentMode: .fit)
        .accessibilityHidden(true)
    }
}

private struct SignalPulseShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let middle = rect.midY
        path.move(to: CGPoint(x: rect.minX, y: middle))
        path.addLine(to: CGPoint(x: rect.width * 0.34, y: middle))
        path.addLine(to: CGPoint(x: rect.width * 0.42, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.width * 0.51, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.width * 0.60, y: middle))
        path.addLine(to: CGPoint(x: rect.maxX, y: middle))
        return path
    }
}

private struct WelcomePage: Identifiable {
    let id: String
    let title: String
    let detail: String
    let proof: String
    let symbol: String
    let tint: Color

    static let all = [
        WelcomePage(
            id: "clarity",
            title: "Votre énergie, enfin claire",
            detail: "Consultez la consommation de la maison et celle de vos prises sans jamais les confondre.",
            proof: "Chaque mesure garde sa source et sa fraîcheur.",
            symbol: "chart.xyaxis.line",
            tint: WattelierTheme.accent
        ),
        WelcomePage(
            id: "live",
            title: "Le direct, sans détour",
            detail: "Suivez la puissance de vos prises et pilotez les appareils compatibles depuis votre iPhone.",
            proof: "Les commandes partent directement vers votre serveur.",
            symbol: "powerplug.fill",
            tint: WattelierTheme.success
        ),
        WelcomePage(
            id: "privacy",
            title: "Vos données restent chez vous",
            detail: "Wattelier se connecte à votre propre serveur en HTTPS. Aucun compte centralisé n’est nécessaire.",
            proof: "Votre jeton est protégé par le trousseau iOS.",
            symbol: "lock.shield.fill",
            tint: Color.indigo
        )
    ]
}
