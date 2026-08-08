import SwiftUI

struct ManualReadingSheet: View {
    @ObservedObject var store: DashboardStore
    @Environment(\.dismiss) private var dismiss
    @State private var date = Date()
    @State private var indexText = ""
    @State private var errorMessage: String?
    @State private var isSaving = false
    @FocusState private var indexIsFocused: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker("Date du relevé", selection: $date, in: ...Date(), displayedComponents: .date)
                    TextField("Ex. 7 101", text: $indexText)
                        .keyboardType(.decimalPad)
                        .focused($indexIsFocused)
                        .accessibilityLabel("Index du compteur en kilowattheures")
                } header: {
                    Text("Index du compteur")
                } footer: {
                    Text("Saisissez le nombre total de kWh affiché par le compteur. Il n’est jamais additionné à la consommation des prises.")
                }

                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(WattelierTheme.alert)
                    }
                }
            }
            .navigationTitle("Nouveau relevé")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") { Task { await save() } }
                        .disabled(isSaving || parsedIndex == nil)
                }
            }
            .interactiveDismissDisabled(isSaving)
            .onAppear { indexIsFocused = true }
        }
    }

    private var parsedIndex: Double? {
        let normalized = indexText
            .replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "\u{202F}", with: "")
            .replacingOccurrences(of: ",", with: ".")
        guard let value = Double(normalized), value >= 0 else { return nil }
        return value
    }

    private func save() async {
        guard let index = parsedIndex else {
            errorMessage = "Saisissez l’index en kWh affiché par le compteur."
            return
        }
        isSaving = true
        errorMessage = nil
        do {
            try await store.addMeterIndex(date: Self.dayString(date), indexKwh: index)
            dismiss()
        } catch {
            if !error.isExpectedCancellation { errorMessage = error.localizedDescription }
        }
        isSaving = false
    }

    private static func dayString(_ date: Date) -> String {
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }
}
