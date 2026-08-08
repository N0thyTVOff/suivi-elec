import SwiftUI

struct DevicesView: View {
    @ObservedObject var store: DashboardStore
    @State private var changing: Set<String> = []
    @State private var confirmation: String?
    @State private var commandError: String?

    var body: some View {
        ZStack {
            SignalBackdrop()
            Group {
                if store.devices.isEmpty {
                    EmptySignalView(
                        symbol: "powerplug", title: "Aucun appareil",
                        detail: "Configurez eWeLink ou Omajin sur le serveur pour retrouver vos prises ici."
                    )
                } else { list }
            }
        }
        .navigationTitle("Appareils")
        .safeAreaInset(edge: .top) {
            if let error = commandError ?? store.error(for: .devices) {
                RefreshIssueBanner(message: error) {
                    commandError = nil
                    Task { await store.refreshDevices() }
                }
            }
        }
        .alert("Commande envoyée", isPresented: Binding(
            get: { confirmation != nil }, set: { if !$0 { confirmation = nil } }
        )) { Button("OK", role: .cancel) {} } message: { Text(confirmation ?? "") }
    }

    private var list: some View {
        List {
            ForEach(store.devices) { device in
                Section {
                    HStack(spacing: 14) {
                        Image(systemName: device.online == 1 ? "powerplug.fill" : "powerplug")
                            .font(.title2)
                            .foregroundStyle(device.online == 1 ? WattelierTheme.success : .secondary)
                            .frame(width: 36, height: 44)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(device.name).font(.headline)
                            Text([device.room, device.model].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(.caption).foregroundStyle(.secondary)
                            Text(device.online == 1 ? "En ligne" : "Hors ligne")
                                .font(.caption2)
                                .foregroundStyle(device.online == 1 ? WattelierTheme.success : .secondary)
                        }
                        Spacer()
                        if changing.contains(device.id) {
                            ProgressView().frame(width: 51)
                        } else if device.switchState != nil {
                            Toggle("Alimentation", isOn: Binding(
                                get: { device.switchState == "on" },
                                set: { next in Task { await setSwitch(device: device, on: next) } }
                            ))
                            .labelsHidden()
                            .disabled(device.online != 1)
                            .accessibilityLabel("Alimentation de \(device.name)")
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await store.refreshDevices() }
    }

    private func setSwitch(device: ServerDevice, on: Bool) async {
        changing.insert(device.id)
        do {
            let state = try await store.setSwitch(deviceID: device.id, on: on)
            confirmation = "\(device.name) est maintenant \(state == "on" ? "allumée" : "éteinte")."
            commandError = nil
        } catch {
            if !error.isExpectedCancellation { commandError = error.localizedDescription }
        }
        changing.remove(device.id)
    }
}
