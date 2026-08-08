import Charts
import SwiftUI

struct RealTimeView: View {
    private struct TotalPowerPoint: Identifiable {
        let date: Date
        let watts: Double
        var id: Date { date }
    }
    let repository: any WattelierRepository
    @Environment(\.scenePhase) private var scenePhase
    @State private var summary: Summary?
    @State private var readings: [RecentReading] = []
    @State private var error: String?
    @State private var loading = true

    private var totals: [TotalPowerPoint] {
        let buckets = Dictionary(grouping: readings) { Int($0.ts / 10_000) }
        return buckets.values.compactMap { bucket in
            guard let ts = bucket.map(\.ts).max() else { return nil }
            let latest = Dictionary(grouping: bucket, by: \.deviceId).compactMapValues { $0.max(by: { $0.ts < $1.ts }) }
            return TotalPowerPoint(
                date: Date(timeIntervalSince1970: ts / 1000),
                watts: latest.values.reduce(0) { $0 + $1.watts }
            )
        }.sorted { $0.date < $1.date }
    }

    var body: some View {
        ZStack {
            SignalBackdrop()
            Group {
                if loading { LoadingSignalView(label: "Connexion au direct…") }
                else if let error { ErrorSignalView(message: error) { Task { await refresh() } } }
                else { content }
            }
        }
        .navigationTitle("Temps réel")
        .task { await pollingLoop() }
    }

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Puissance actuelle des prises").font(.headline)
                        Text(summary?.nowW.wattsText ?? "—")
                            .font(.system(.largeTitle, design: .rounded, weight: .bold))
                            .monospacedDigit()
                    }
                    Spacer()
                    Label("Direct", systemImage: "dot.radiowaves.left.and.right")
                        .font(.caption.weight(.semibold)).foregroundStyle(WattelierTheme.success)
                }

                Chart(totals) { point in
                    AreaMark(x: .value("Heure", point.date), y: .value("Watts", point.watts))
                        .foregroundStyle(WattelierTheme.accent.opacity(0.12))
                    LineMark(x: .value("Heure", point.date), y: .value("Watts", point.watts))
                        .foregroundStyle(WattelierTheme.accent)
                        .interpolationMethod(.catmullRom)
                }
                .chartYAxisLabel("W")
                .frame(height: 240)
                .accessibilityLabel("Puissance totale des prises durant les trente dernières minutes")

                VStack(spacing: 0) {
                    ForEach(summary?.devices ?? []) { device in
                        HStack(spacing: 12) {
                            Circle().fill(device.isFresh ? WattelierTheme.success : Color.secondary)
                                .frame(width: 9, height: 9).accessibilityHidden(true)
                            VStack(alignment: .leading) {
                                Text(device.name).fontWeight(.semibold)
                                Text(device.todayKwh?.kwhText ?? "Énergie du jour indisponible")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(device.watts.wattsText).monospacedDigit().fontWeight(.semibold)
                        }
                        .frame(minHeight: 58)
                        if device.id != summary?.devices.last?.id { Divider() }
                    }
                }
            }
            .padding()
        }
        .refreshable { await refresh() }
    }

    private func pollingLoop() async {
        await refresh()
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(10))
            if scenePhase == .active { await refresh(showLoading: false) }
        }
    }

    private func refresh(showLoading: Bool = true) async {
        if showLoading { loading = summary == nil }
        do {
            async let nextSummary = repository.summary()
            async let nextReadings = repository.recentReadings(minutes: 30)
            (summary, readings) = try await (nextSummary, nextReadings)
            error = nil
        } catch { self.error = error.localizedDescription }
        loading = false
    }
}
