import XCTest
@testable import Wattelier

final class DemoRepositoryTests: XCTestCase {
    func testDemoKeepsHouseAndPlugConsumptionSeparate() async throws {
        let summary = try await DemoRepository().summary()

        XCTAssertNotNil(summary.todayHouseKwh)
        XCTAssertGreaterThan(summary.todayHouseKwh ?? 0, summary.todayPlugsKwh)
        XCTAssertNotEqual(summary.todayHouseKwh, summary.todayPlugsKwh)
    }

    func testDemoReturnsRequestedHistory() async throws {
        let days = try await DemoRepository().daily(days: 30)

        XCTAssertEqual(days.count, 30)
        XCTAssertTrue(days.allSatisfy { $0.houseKwh != nil && $0.plugsKwh != nil })
    }
}
