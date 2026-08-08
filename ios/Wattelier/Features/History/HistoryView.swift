import Charts
import SwiftUI

struct HistoryView: View {
    let repository: any WattelierRepository
    @State private var days = 30
    @State private var rows: [DailyEnergy] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        ZStack {
            SignalBackdrop()
            Group {
                if loading { LoadingSignalView(label: "Chargement de l’historique…") }
                else if let error { ErrorSignalView(message: error) { Task { await load() } } }
                else { content }
            }
        }
        .navigationTitle("Historique")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Picker("Période", selection: $days) {
                    Text("7 j").tag(7); Text("30 j").tag(30); Text("90 j").tag(90)
                }.pickerStyle(.segmented).frame(maxWidth: 220)
            }
        }
        .task(id: days) { await load() }
    }

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Text("Les valeurs maison et prises ne sont jamais additionnées.")
                    .font(.subheadline).foregroundStyle(.secondary)

                Chart(rows) { row in
                    if let house = row.houseKwh {
                        BarMark(x: .value("Jour", row.parsedDate), y: .value("Maison", house))
                            .foregroundStyle(Color.indigo.opacity(0.72))
                    }
                    if let plugs = row.plugsKwh {
                        LineMark(x: .value("Jour", row.parsedDate), y: .value("Prises", plugs))
                            .foregroundStyle(WattelierTheme.accent)
                            .lineStyle(.init(lineWidth: 2.5))
                    }
                }
                .chartYAxisLabel("kWh")
                .frame(height: 300)

                VStack(spacing: 0) {
                    ForEach(rows.reversed()) { row in
                        HStack {
                            Text(row.parsedDate.formatted(date: .abbreviated, time: .omitted))
                            Spacer()
                            VStack(alignment: .trailing) {
                                Text(row.houseKwh?.kwhText ?? "Maison —").fontWeight(.semibold)
                                Text("Prises \(row.plugsKwh?.kwhText ?? "—")")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        .frame(minHeight: 58)
                        if row.id != rows.first?.id { Divider() }
                    }
                }
            }
            .padding()
        }
        .refreshable { await load() }
    }

    private func load() async {
        loading = rows.isEmpty
        do { rows = try await repository.daily(days: days); error = nil }
        catch { self.error = error.localizedDescription }
        loading = false
    }
}

