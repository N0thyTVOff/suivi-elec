import SwiftUI

struct DevicesView: View {
    let repository: any WattelierRepository
    @State private var devices: [ServerDevice] = []
    @State private var loading = true
    @State private var error: String?
    @State private var changing: Set<String> = []
    @State private var confirmation: String?

    var body: some View {
        ZStack {
            SignalBackdrop()
            Group {
                if loading { LoadingSignalView(label: "Recherche des appareils…") }
                else if let error { ErrorSignalView(message: error) { Task { await load() } } }
                else if devices.isEmpty {
                    EmptySignalView(
                        symbol: "powerplug", title: "Aucun appareil",
                        detail: "Configurez eWeLink ou Omajin sur le serveur pour retrouver vos prises ici."
                    )
                } else { list }
            }
        }
        .navigationTitle("Appareils")
        .task { await load() }
        .alert("Commande envoyée", isPresented: Binding(
            get: { confirmation != nil }, set: { if !$0 { confirmation = nil } }
        )) { Button("OK", role: .cancel) {} } message: { Text(confirmation ?? "") }
    }

    private var list: some View {
        List {
            ForEach($devices) { $device in
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
        .refreshable { await load() }
    }

    private func load() async {
        loading = devices.isEmpty
        do { devices = try await repository.devices(); error = nil }
        catch { self.error = error.localizedDescription }
        loading = false
    }

    private func setSwitch(device: ServerDevice, on: Bool) async {
        changing.insert(device.id)
        do {
            let state = try await repository.setSwitch(deviceID: device.id, on: on)
            if let index = devices.firstIndex(where: { $0.id == device.id }) {
                let current = devices[index]
                devices[index] = ServerDevice(
                    id: current.id, name: current.name, room: current.room, model: current.model,
                    online: current.online, source: current.source, lastSeen: current.lastSeen, switchState: state
                )
            }
            confirmation = "\(device.name) est maintenant \(state == "on" ? "allumée" : "éteinte")."
        } catch { self.error = error.localizedDescription }
        changing.remove(device.id)
    }
}

