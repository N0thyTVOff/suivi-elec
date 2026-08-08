import XCTest
@testable import Wattelier

@MainActor
final class DashboardStoreTests: XCTestCase {
    func testRefreshKeepsCachedSummaryWhenNetworkFails() async {
        let repository = ControllableRepository()
        let store = DashboardStore(repository: repository)

        await store.refreshSummary()
        let cached = store.summary
        repository.summaryError = URLError(.notConnectedToInternet)
        await store.refreshSummary()

        XCTAssertEqual(store.summary, cached)
        XCTAssertNotNil(store.error(for: .summary))
    }

    func testCancellationNeverBecomesAVisibleConnectionError() async {
        let repository = ControllableRepository()
        repository.summaryError = URLError(.cancelled)
        repository.readingsError = CancellationError()
        let store = DashboardStore(repository: repository)

        await store.refreshLiveData()

        XCTAssertNil(store.error(for: .summary))
        XCTAssertNil(store.error(for: .realtime))
    }

    func testWidgetSnapshotKeepsHouseAndPlugsSeparate() throws {
        let snapshot = WidgetSnapshot.placeholder
        let decoded = try JSONDecoder().decode(WidgetSnapshot.self, from: JSONEncoder().encode(snapshot))

        XCTAssertEqual(decoded, snapshot)
        XCTAssertNotEqual(decoded.todayHouseKwh, decoded.todayPlugsKwh)
    }
}

private final class ControllableRepository: WattelierRepository, @unchecked Sendable {
    let displayServer = "Tests"
    let isDemo = false
    var summaryError: Error?
    var readingsError: Error?

    func validate() async throws {}

    func summary() async throws -> Summary {
        if let summaryError { throw summaryError }
        return try await DemoRepository().summary()
    }

    func daily(days: Int) async throws -> [DailyEnergy] {
        try await DemoRepository().daily(days: days)
    }

    func recentReadings(minutes: Int) async throws -> [RecentReading] {
        if let readingsError { throw readingsError }
        return try await DemoRepository().recentReadings(minutes: minutes)
    }

    func devices() async throws -> [ServerDevice] {
        try await DemoRepository().devices()
    }

    func billing() async throws -> Billing {
        try await DemoRepository().billing()
    }

    func setSwitch(deviceID: String, on: Bool) async throws -> String {
        on ? "on" : "off"
    }
}
