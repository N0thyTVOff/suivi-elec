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
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var selection: AppSection = .overview

    var body: some View {
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
                tab(.overview) { OverviewView(repository: repository) }
                tab(.realtime) { RealTimeView(repository: repository) }
                tab(.history) { HistoryView(repository: repository) }
                tab(.devices) { DevicesView(repository: repository) }
                NavigationStack { MoreView(repository: repository) }
                    .tabItem { Label("Plus", systemImage: "ellipsis") }
                    .tag(AppSection.settings)
            }
        }
    }

    @ViewBuilder private func destination(_ section: AppSection) -> some View {
        switch section {
        case .overview: OverviewView(repository: repository)
        case .realtime: RealTimeView(repository: repository)
        case .history: HistoryView(repository: repository)
        case .devices: DevicesView(repository: repository)
        case .billing: BillingView(repository: repository)
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
    var body: some View {
        List {
            Section {
                NavigationLink { BillingView(repository: repository) } label: {
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
