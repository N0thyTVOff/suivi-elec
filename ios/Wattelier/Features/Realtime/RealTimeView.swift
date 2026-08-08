import Charts
import SwiftUI

struct RealTimeView: View {
    private struct TotalPowerPoint: Identifiable {
        let date: Date
        let watts: Double
        var id: Date { date }
    }
    @ObservedObject var store: DashboardStore

    private var totals: [TotalPowerPoint] {
        let buckets = Dictionary(grouping: store.readings) { Int($0.ts / 10_000) }
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
            content
                .redacted(reason: store.summary == nil ? .placeholder : [])
        }
        .navigationTitle("Temps réel")
        .safeAreaInset(edge: .top) {
            if let error = store.error(for: .realtime) ?? store.error(for: .summary) {
                RefreshIssueBanner(message: error) { Task { await store.refreshLiveData() } }
            }
        }
    }

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Puissance actuelle des prises").font(.headline)
                        Text(store.summary?.nowW.wattsText ?? "000 W")
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
                    ForEach(store.summary?.devices ?? Self.placeholderDevices) { device in
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
                        if device.id != (store.summary?.devices ?? Self.placeholderDevices).last?.id { Divider() }
                    }
                }
            }
            .padding()
        }
        .refreshable { await store.refreshLiveData() }
    }

    private static let placeholderDevices = [
        DeviceReading(
            deviceID: "placeholder-1",
            name: "Prise Wattelier",
            watts: 120,
            volts: nil,
            amps: nil,
            ts: Date().timeIntervalSince1970 * 1000,
            online: 1,
            switchState: nil,
            todayKwh: 0.75
        ),
        DeviceReading(
            deviceID: "placeholder-2",
            name: "Appareil connecté",
            watts: 80,
            volts: nil,
            amps: nil,
            ts: Date().timeIntervalSince1970 * 1000,
            online: 1,
            switchState: nil,
            todayKwh: 0.42
        )
    ]
}
