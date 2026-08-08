import Charts
import SwiftUI

struct BillingView: View {
    let repository: any WattelierRepository
    @State private var billing: Billing?
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        ZStack {
            SignalBackdrop()
            Group {
                if loading { LoadingSignalView(label: "Calcul de la projection…") }
                else if let error { ErrorSignalView(message: error) { Task { await load() } } }
                else if let billing { content(billing) }
            }
        }
        .navigationTitle("Facturation")
        .task { await load() }
    }

    private func content(_ billing: Billing) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 155), spacing: 12)], spacing: 12) {
                    SignalMetric(
                        title: "Versé à ce jour", value: billing.paidToDate.euroText,
                        detail: "Échéancier enregistré", symbol: "checkmark.circle.fill", tint: WattelierTheme.success
                    )
                    SignalMetric(
                        title: "Coût estimé à ce jour", value: billing.realCostToDate?.euroText ?? "—",
                        detail: "\(billing.daysMeasured) jour(s) mesuré(s)", symbol: "bolt.fill"
                    )
                    SignalMetric(
                        title: (billing.projectedRegul ?? 0) > 0 ? "Régularisation à payer" : "Remboursement estimé",
                        value: abs(billing.projectedRegul ?? 0).euroText,
                        detail: "Projection, pas une facture", symbol: "arrow.triangle.2.circlepath",
                        tint: (billing.projectedRegul ?? 0) > 0 ? WattelierTheme.alert : WattelierTheme.success
                    )
                    SignalMetric(
                        title: "Mensualité idéale", value: billing.idealMonthly?.euroText ?? "—",
                        detail: "Selon la consommation disponible", symbol: "calendar"
                    )
                }

                VStack(alignment: .leading, spacing: 10) {
                    Text("Fiabilité de la projection").font(.headline)
                    ProgressView(value: min(billing.coveragePct, 100), total: 100)
                        .tint(billing.coveragePct > 80 ? WattelierTheme.success : WattelierTheme.warning)
                    Text("\(billing.coveragePct.formatted(.number.precision(.fractionLength(0)))) % des jours écoulés sont mesurés.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                .padding(16)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                VStack(alignment: .leading, spacing: 0) {
                    Text("Prochaines échéances").font(.headline).padding(.bottom, 8)
                    ForEach(billing.installments.filter { $0.date >= billing.today }.prefix(5)) { installment in
                        HStack {
                            Text(ISO8601Day.date(from: installment.date)?.formatted(date: .abbreviated, time: .omitted) ?? installment.date)
                            Spacer()
                            Text(installment.amount.euroText).fontWeight(.semibold).monospacedDigit()
                        }
                        .frame(minHeight: 50)
                        Divider()
                    }
                }
            }
            .padding()
        }
        .refreshable { await load() }
    }

    private func load() async {
        loading = billing == nil
        do { billing = try await repository.billing(); error = nil }
        catch { self.error = error.localizedDescription }
        loading = false
    }
}
