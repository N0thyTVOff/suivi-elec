import Charts
import SwiftUI

struct OverviewView: View {
    let repository: any WattelierRepository
    @State private var summary: Summary?
    @State private var daily: [DailyEnergy] = []
    @State private var error: String?
    @State private var loading = true

    var body: some View {
        ZStack {
            SignalBackdrop()
            Group {
                if loading { LoadingSignalView(label: "Lecture de votre énergie…") }
                else if let error { ErrorSignalView(message: error) { Task { await load() } } }
                else if let summary { content(summary) }
            }
        }
        .navigationTitle("Aujourd’hui")
        .toolbar { ToolbarItem(placement: .topBarTrailing) { ServerBadge(repository: repository) } }
        .task { await load() }
    }

    private func content(_ summary: Summary) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 155), spacing: 12)], spacing: 12) {
                    SignalMetric(
                        title: "Puissance des prises", value: summary.nowW.wattsText,
                        detail: "\(summary.devices.filter(\.isFresh).count)/\(summary.devices.count) mesure(s) récente(s)",
                        symbol: "bolt.fill"
                    )
                    SignalMetric(
                        title: "Prises aujourd’hui", value: summary.todayPlugsKwh.kwhText,
                        detail: (summary.todayPlugsKwh * summary.prices.kwh).euroText,
                        symbol: "powerplug.fill", tint: WattelierTheme.success
                    )
                    SignalMetric(
                        title: "Maison aujourd’hui",
                        value: summary.todayHouseKwh?.kwhText ?? "J+1",
                        detail: "Mesure Linky ou relevé manuel — jamais additionnée aux prises",
                        symbol: "house.fill", tint: .indigo
                    )
                    SignalMetric(
                        title: "Charge de l’abonnement",
                        value: "\(Int(min(summary.nowW / max(summary.prices.kva * 1000, 1) * 100, 100))) %",
                        detail: "Abonnement \(summary.prices.kva.formatted()) kVA",
                        symbol: "gauge.with.dots.needle.50percent",
                        tint: summary.nowW > summary.prices.kva * 900 ? WattelierTheme.alert : WattelierTheme.warning
                    )
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text("Rythme des 10 derniers jours").font(.headline)
                    Text("Maison et prises sont deux séries distinctes.")
                        .font(.caption).foregroundStyle(.secondary)
                    Chart(daily.suffix(10)) { row in
                        if let house = row.houseKwh {
                            LineMark(x: .value("Jour", row.parsedDate), y: .value("Maison", house))
                                .foregroundStyle(by: .value("Source", "Maison"))
                                .symbol(by: .value("Source", "Maison"))
                        }
                        if let plugs = row.plugsKwh {
                            LineMark(x: .value("Jour", row.parsedDate), y: .value("Prises", plugs))
                                .foregroundStyle(by: .value("Source", "Prises"))
                                .symbol(by: .value("Source", "Prises"))
                        }
                    }
                    .chartForegroundStyleScale(["Maison": Color.indigo, "Prises": WattelierTheme.accent])
                    .chartYAxisLabel("kWh")
                    .frame(height: 220)
                    .accessibilityLabel("Courbe séparée de la consommation maison et des prises sur dix jours")
                }
                .padding(16)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    Text("Appareils récents").font(.headline).padding(.bottom, 6)
                    if summary.devices.isEmpty {
                        Text("Aucune prise ne fournit encore de mesure.").foregroundStyle(.secondary)
                    } else {
                        ForEach(summary.devices.prefix(5)) { device in
                            HStack(spacing: 12) {
                                Image(systemName: "powerplug.fill")
                                    .foregroundStyle(device.isFresh ? WattelierTheme.success : .secondary)
                                    .frame(width: 32, height: 44)
                                VStack(alignment: .leading) {
                                    Text(device.name).font(.body.weight(.semibold))
                                    FreshnessLabel(timestampMilliseconds: device.ts)
                                }
                                Spacer()
                                Text(device.watts.wattsText).font(.body.monospacedDigit().weight(.semibold))
                            }
                            if device.id != summary.devices.prefix(5).last?.id { Divider() }
                        }
                    }
                }
                .padding(16)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .padding()
        }
        .refreshable { await load() }
    }

    private func load() async {
        loading = summary == nil
        error = nil
        do {
            async let nextSummary = repository.summary()
            async let nextDaily = repository.daily(days: 10)
            (summary, daily) = try await (nextSummary, nextDaily)
        } catch { self.error = error.localizedDescription }
        loading = false
    }
}
