import Foundation

protocol WattelierRepository: AnyObject, Sendable {
    var displayServer: String { get }
    var isDemo: Bool { get }
    func validate() async throws
    func summary() async throws -> Summary
    func daily(days: Int) async throws -> [DailyEnergy]
    func recentReadings(minutes: Int) async throws -> [RecentReading]
    func devices() async throws -> [ServerDevice]
    func billing() async throws -> Billing
    func setSwitch(deviceID: String, on: Bool) async throws -> String
    func addMeterIndex(date: String, indexKwh: Double) async throws -> MeterIndexList
}

final class LiveRepository: WattelierRepository, @unchecked Sendable {
    private let client: APIClient
    var displayServer: String { client.connection.serverURL.host ?? client.connection.serverURL.absoluteString }
    let isDemo = false

    init(connection: ServerConnection) { client = APIClient(connection: connection) }

    func validate() async throws {
        let status: SetupStatus = try await client.request("setup/status")
        guard status.onboardingCompleted, status.authenticated else { throw APIError.unauthorized }
    }

    func summary() async throws -> Summary { try await client.request("summary") }
    func daily(days: Int) async throws -> [DailyEnergy] { try await client.request("daily?days=\(days)") }
    func recentReadings(minutes: Int) async throws -> [RecentReading] {
        try await client.request("readings/recent?minutes=\(minutes)")
    }
    func devices() async throws -> [ServerDevice] { try await client.request("devices") }
    func billing() async throws -> Billing { try await client.request("billing") }

    func addMeterIndex(date: String, indexKwh: Double) async throws -> MeterIndexList {
        struct Request: Encodable {
            let date: String
            let index_kwh: Double
        }
        let body = try JSONEncoder().encode(Request(date: date, index_kwh: indexKwh))
        return try await client.request("meter-index", method: "POST", body: body)
    }

    func setSwitch(deviceID: String, on: Bool) async throws -> String {
        let body = try JSONEncoder().encode(["on": on])
        let response: SwitchResponse = try await client.request(
            "devices/\(deviceID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? deviceID)/switch",
            method: "POST",
            body: body
        )
        return response.state
    }
}

final class DemoRepository: WattelierRepository, @unchecked Sendable {
    let displayServer = "Démonstration locale"
    let isDemo = true
    private let calendar = Calendar.current

    func validate() async throws {}

    func summary() async throws -> Summary {
        Summary(
            nowW: 684,
            devices: [
                DeviceReading(deviceID: "demo-bureau", name: "Bureau", watts: 146, volts: 231.2, amps: 0.63, ts: now(-8), online: 1, switchState: "on", todayKwh: 0.82),
                DeviceReading(deviceID: "demo-salon", name: "Télévision", watts: 92, volts: 230.8, amps: 0.40, ts: now(-14), online: 1, switchState: "on", todayKwh: 0.54),
                DeviceReading(deviceID: "demo-cuisine", name: "Lave-vaisselle", watts: 446, volts: 231.0, amps: 1.93, ts: now(-22), online: 1, switchState: "on", todayKwh: 1.31)
            ],
            todayPlugsKwh: 2.67,
            todayHouseKwh: 8.42,
            yesterdayPlugsKwh: 3.14,
            yesterdayHouseKwh: 11.86,
            yesterdayHouseFrom: "linky",
            prices: PriceInfo(kwh: 0.2016, subMonth: 13.09, kva: 6)
        )
    }

    func daily(days: Int) async throws -> [DailyEnergy] {
        let count = min(max(days, 7), 90)
        return (0..<count).reversed().map { offset in
            let date = calendar.date(byAdding: .day, value: -offset, to: Date()) ?? Date()
            let wave = sin(Double(offset) * 0.72)
            let house = 10.8 + wave * 2.1 + Double(offset % 4) * 0.35
            let plugs = 2.5 + wave * 0.55
            return DailyEnergy(
                date: Self.dayFormatter.string(from: date),
                houseKwh: house,
                houseFrom: "demo",
                plugsKwh: plugs,
                houseEur: house * 0.2016,
                plugsEur: plugs * 0.2016
            )
        }
    }

    func recentReadings(minutes: Int) async throws -> [RecentReading] {
        let names = [("demo-bureau", "Bureau", 145.0), ("demo-salon", "Télévision", 90.0), ("demo-cuisine", "Lave-vaisselle", 440.0)]
        return stride(from: min(minutes, 30), through: 0, by: -2).flatMap { minute in
            names.enumerated().map { index, item in
                let variation = sin(Double(minute + index * 3)) * (index == 2 ? 90 : 12)
                return RecentReading(
                    deviceId: item.0,
                    name: item.1,
                    ts: now(-Double(minute * 60)),
                    watts: max(0, item.2 + variation),
                    volts: 231,
                    amps: nil
                )
            }
        }
    }

    func devices() async throws -> [ServerDevice] {
        [
            ServerDevice(id: "demo-bureau", name: "Bureau", room: "Bureau", model: "S26R2ZB", online: 1, source: "demo", lastSeen: now(-8), switchState: "on"),
            ServerDevice(id: "demo-salon", name: "Télévision", room: "Salon", model: "OSP-FR-01", online: 1, source: "demo", lastSeen: now(-14), switchState: "on"),
            ServerDevice(id: "demo-cuisine", name: "Lave-vaisselle", room: "Cuisine", model: "S60TPF", online: 1, source: "demo", lastSeen: now(-22), switchState: "on")
        ]
    }

    func billing() async throws -> Billing {
        Billing(
            start: "2026-01-01", end: "2026-12-31", today: Self.dayFormatter.string(from: Date()),
            totalDays: 365, elapsedDays: 220, daysMeasured: 216, coveragePct: 98.2,
            installments: (1...12).map { Installment(date: "2026-\(String(format: "%02d", $0))-05", amount: 92) },
            paidToDate: 736, plannedTotal: 1104, nextInstallment: Installment(date: "2026-09-05", amount: 92),
            avgDayKwh: 11.2, kwhMeasured: 2419.2, realCostToDate: 671.4, balance: 64.6,
            projectedYearKwh: 4088, projectedTotal: 981.2, projectedRegul: -122.8, idealMonthly: 81.77
        )
    }

    func setSwitch(deviceID: String, on: Bool) async throws -> String { on ? "on" : "off" }

    func addMeterIndex(date: String, indexKwh: Double) async throws -> MeterIndexList {
        MeterIndexList(entries: [MeterIndexEntry(date: date, indexKwh: indexKwh)], manualDays: [])
    }

    private func now(_ offsetSeconds: Double) -> Double {
        (Date().timeIntervalSince1970 + offsetSeconds) * 1000
    }

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}
