import SwiftUI

enum AppSection: String, CaseIterable, Identifiable {
    case overview, realtime, history, devices, billing, settings
    var id: String { rawValue }
    var label: String {
        switch self {
        case .overview: "Accueil"
        case .realtime: "Direct"
        case .history: "Historique"
        case .devices: "Appareils"
        case .billing: "Facturation"
        case .settings: "Réglages"
        }
    }
    var symbol: String {
        switch self {
        case .overview: "gauge.with.dots.needle.50percent"
        case .realtime: "waveform.path.ecg"
        case .history: "chart.xyaxis.line"
        case .devices: "powerplug.fill"
        case .billing: "eurosign.circle.fill"
        case .settings: "gearshape.fill"
        }
    }
}

struct MainNavigationView: View {
    let repository: any WattelierRepository
    @StateObject private var store: DashboardStore
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var selection: AppSection = .overview

    init(repository: any WattelierRepository) {
        self.repository = repository
        _store = StateObject(wrappedValue: DashboardStore(repository: repository))
    }

    var body: some View {
        Group {
            if horizontalSizeClass == .regular {
                NavigationSplitView {
                    List(AppSection.allCases) { section in
                        Button {
                            selection = section
                        } label: {
                            Label(section.label, systemImage: section.symbol)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(selection == section ? WattelierTheme.accent : .primary)
                        .accessibilityAddTraits(selection == section ? .isSelected : [])
                    }
                    .navigationTitle("Wattelier")
                    .safeAreaInset(edge: .bottom) {
                        ServerBadge(repository: repository).padding()
                    }
                } detail: {
                    NavigationStack { destination(selection) }
                }
            } else {
                TabView(selection: $selection) {
                    tab(.overview) { OverviewView(store: store) }
                    tab(.realtime) { RealTimeView(store: store) }
                    tab(.history) { HistoryView(store: store) }
                    tab(.devices) { DevicesView(store: store) }
                    NavigationStack { MoreView(repository: repository, store: store) }
                        .tabItem { Label("Plus", systemImage: "ellipsis") }
                        .tag(AppSection.settings)
                }
            }
        }
        .task { await store.run() }
    }

    @ViewBuilder private func destination(_ section: AppSection) -> some View {
        switch section {
        case .overview: OverviewView(store: store)
        case .realtime: RealTimeView(store: store)
        case .history: HistoryView(store: store)
        case .devices: DevicesView(store: store)
        case .billing: BillingView(store: store)
        case .settings: SettingsView(repository: repository)
        }
    }

    private func tab<Content: View>(_ section: AppSection, @ViewBuilder content: () -> Content) -> some View {
        NavigationStack { content() }
            .tabItem { Label(section.label, systemImage: section.symbol) }
            .tag(section)
    }
}

struct MoreView: View {
    let repository: any WattelierRepository
    @ObservedObject var store: DashboardStore
    var body: some View {
        List {
            Section {
                NavigationLink { BillingView(store: store) } label: {
                    Label("Facturation", systemImage: AppSection.billing.symbol)
                }
                NavigationLink { SettingsView(repository: repository) } label: {
                    Label("Réglages", systemImage: AppSection.settings.symbol)
                }
            }
            Section { ServerBadge(repository: repository) }
        }
        .navigationTitle("Plus")
    }
}
