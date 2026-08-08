import Foundation
import WidgetKit

@MainActor
final class DashboardStore: ObservableObject {
    enum Area: Hashable {
        case summary, realtime, history(Int), devices, billing
    }

    @Published private(set) var summary: Summary?
    @Published private(set) var readings: [RecentReading] = []
    @Published private(set) var histories: [Int: [DailyEnergy]] = [:]
    @Published private(set) var devices: [ServerDevice] = []
    @Published private(set) var billing: Billing?
    @Published private(set) var errors: [Area: String] = [:]
    @Published private(set) var refreshing = false

    let repository: any WattelierRepository
    private var slowRefreshTick = 0

    init(repository: any WattelierRepository) {
        self.repository = repository
    }

    func run() async {
        await refreshAll()
        if ProcessInfo.processInfo.arguments.contains("-uitesting-demo") { return }
        do {
            while !Task.isCancelled {
                try await Task.sleep(for: .seconds(10))
                await refreshLiveData()
                slowRefreshTick += 1
                if slowRefreshTick.isMultiple(of: 6) {
                    async let history: Void = refreshHistory(days: 30)
                    async let devices: Void = refreshDevices()
                    async let billing: Void = refreshBilling()
                    _ = await (history, devices, billing)
                }
            }
        } catch is CancellationError {
            // Quitter la session ou placer l’app en veille est un arrêt normal.
        } catch {
            // Task.sleep ne produit actuellement que CancellationError.
        }
    }

    func refreshAll() async {
        refreshing = true
        async let summary: Void = refreshSummary()
        async let realtime: Void = refreshReadings()
        async let history: Void = refreshHistory(days: 30)
        async let devices: Void = refreshDevices()
        async let billing: Void = refreshBilling()
        _ = await (summary, realtime, history, devices, billing)
        refreshing = false
    }

    func refreshLiveData() async {
        async let summary: Void = refreshSummary()
        async let realtime: Void = refreshReadings()
        _ = await (summary, realtime)
    }

    func refreshSummary() async {
        do {
            let next = try await repository.summary()
            guard !Task.isCancelled else { return }
            summary = next
            errors[.summary] = nil
            saveWidgetSnapshot(next)
        } catch {
            record(error, for: .summary)
        }
    }

    func refreshReadings() async {
        do {
            let next = try await repository.recentReadings(minutes: 30)
            guard !Task.isCancelled else { return }
            readings = next
            errors[.realtime] = nil
        } catch {
            record(error, for: .realtime)
        }
    }

    func refreshHistory(days: Int) async {
        do {
            let next = try await repository.daily(days: days)
            guard !Task.isCancelled else { return }
            histories[days] = next
            errors[.history(days)] = nil
        } catch {
            record(error, for: .history(days))
        }
    }

    func refreshDevices() async {
        do {
            let next = try await repository.devices()
            guard !Task.isCancelled else { return }
            devices = next
            errors[.devices] = nil
        } catch {
            record(error, for: .devices)
        }
    }

    func refreshBilling() async {
        do {
            let next = try await repository.billing()
            guard !Task.isCancelled else { return }
            billing = next
            errors[.billing] = nil
        } catch {
            record(error, for: .billing)
        }
    }

    func setSwitch(deviceID: String, on: Bool) async throws -> String {
        let state = try await repository.setSwitch(deviceID: deviceID, on: on)
        guard !Task.isCancelled else { throw CancellationError() }
        if let index = devices.firstIndex(where: { $0.id == deviceID }) {
            let current = devices[index]
            devices[index] = ServerDevice(
                id: current.id,
                name: current.name,
                room: current.room,
                model: current.model,
                online: current.online,
                source: current.source,
                lastSeen: current.lastSeen,
                switchState: state
            )
        }
        await refreshSummary()
        return state
    }

    func error(for area: Area) -> String? { errors[area] }

    private func record(_ error: Error, for area: Area) {
        guard !error.isExpectedCancellation else { return }
        errors[area] = error.localizedDescription
    }

    private func saveWidgetSnapshot(_ summary: Summary) {
        WidgetSnapshotStore.save(WidgetSnapshot(
            updatedAt: Date(),
            serverName: repository.displayServer,
            isDemo: repository.isDemo,
            nowW: summary.nowW,
            todayPlugsKwh: summary.todayPlugsKwh,
            todayHouseKwh: summary.todayHouseKwh,
            devices: summary.devices.prefix(6).map {
                WidgetSnapshot.Device(id: $0.id, name: $0.name, watts: $0.watts, isFresh: $0.isFresh)
            }
        ))
        WidgetCenter.shared.reloadTimelines(ofKind: "WattelierEnergyWidget")
    }
}

extension Error {
    var isExpectedCancellation: Bool {
        if self is CancellationError { return true }
        if let urlError = self as? URLError, urlError.code == .cancelled { return true }
        let nsError = self as NSError
        return nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled
    }
}
