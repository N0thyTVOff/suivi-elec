import SwiftUI

struct SignalBackdrop: View {
    var body: some View {
        LinearGradient(
            colors: [WattelierTheme.accent.opacity(0.10), Color.clear],
            startPoint: .topLeading,
            endPoint: .center
        )
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}

struct SignalMetric: View {
    let title: String
    let value: String
    var detail: String? = nil
    var symbol: String
    var tint: Color = WattelierTheme.accent

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(title, systemImage: symbol)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
                .lineLimit(2)
            Text(value)
                .font(.title2.weight(.bold))
                .monospacedDigit()
                .contentTransition(.numericText())
            if let detail {
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 126, alignment: .topLeading)
        .padding(16)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(alignment: .topTrailing) {
            Circle().fill(tint.opacity(0.13)).frame(width: 48, height: 48).offset(x: 15, y: -15)
                .accessibilityHidden(true)
        }
    }
}

struct ServerBadge: View {
    let repository: any WattelierRepository

    var body: some View {
        Label(repository.isDemo ? "Démonstration" : repository.displayServer,
              systemImage: repository.isDemo ? "sparkles" : "lock.shield.fill")
            .font(.caption.weight(.medium))
            .foregroundStyle(repository.isDemo ? WattelierTheme.warning : WattelierTheme.success)
            .lineLimit(1)
            .accessibilityLabel(repository.isDemo ? "Mode démonstration" : "Serveur sécurisé \(repository.displayServer)")
    }
}

struct LoadingSignalView: View {
    let label: String
    var body: some View {
        VStack(spacing: 14) {
            ProgressView()
            Text(label).font(.subheadline).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 220)
    }
}

struct EmptySignalView: View {
    let symbol: String
    let title: String
    let detail: String
    var body: some View {
        ContentUnavailableView(title, systemImage: symbol, description: Text(detail))
    }
}

struct ErrorSignalView: View {
    let message: String
    let retry: () -> Void
    var body: some View {
        ContentUnavailableView {
            Label("Connexion interrompue", systemImage: "wifi.exclamationmark")
        } description: {
            Text(message)
        } actions: {
            Button("Réessayer", action: retry).buttonStyle(.borderedProminent)
        }
    }
}

struct RefreshIssueBanner: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "wifi.exclamationmark")
                .foregroundStyle(WattelierTheme.warning)
                .accessibilityHidden(true)
            Text(message)
                .font(.caption)
                .lineLimit(2)
            Spacer(minLength: 4)
            Button("Réessayer", action: retry)
                .font(.caption.weight(.semibold))
                .frame(minHeight: 44)
        }
        .padding(.horizontal, 16)
        .background(.bar)
    }
}

struct FreshnessLabel: View {
    let timestampMilliseconds: Double
    var body: some View {
        let date = Date(timeIntervalSince1970: timestampMilliseconds / 1000)
        Text(date, style: .relative)
            .font(.caption)
            .foregroundStyle(.secondary)
    }
}
