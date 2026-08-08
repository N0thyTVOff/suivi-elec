import Foundation

struct SetupStatus: Decodable {
    let onboardingCompleted: Bool
    let authenticated: Bool
}

struct Summary: Codable, Equatable {
    let nowW: Double
    let devices: [DeviceReading]
    let todayPlugsKwh: Double
    let todayHouseKwh: Double?
    let yesterdayPlugsKwh: Double?
    let yesterdayHouseKwh: Double?
    let yesterdayHouseFrom: String?
    let prices: PriceInfo
}

struct PriceInfo: Codable, Equatable {
    let kwh: Double
    let subMonth: Double?
    let kva: Double
}

struct DeviceReading: Codable, Identifiable, Equatable {
    let deviceID: String
    let name: String
    let watts: Double
    let volts: Double?
    let amps: Double?
    let ts: Double
    let online: Int?
    var switchState: String?
    let todayKwh: Double?

    var id: String { deviceID }
    var isFresh: Bool { Date().timeIntervalSince1970 * 1000 - ts < 150_000 }

    enum CodingKeys: String, CodingKey {
        case deviceID = "device_id"
        case name, watts, volts, amps, ts, online
        case switchState = "switch_state"
        case todayKwh
    }
}

struct DailyEnergy: Codable, Identifiable, Equatable {
    let date: String
    let houseKwh: Double?
    let houseFrom: String?
    let plugsKwh: Double?
    let houseEur: Double?
    let plugsEur: Double?

    var id: String { date }
    var parsedDate: Date { ISO8601Day.date(from: date) ?? .distantPast }
}

struct RecentReading: Codable, Identifiable, Equatable {
    let deviceId: String
    let name: String
    let ts: Double
    let watts: Double
    let volts: Double?
    let amps: Double?

    var id: String { "\(deviceId)-\(ts)" }
    var date: Date { Date(timeIntervalSince1970: ts / 1000) }
}

struct ServerDevice: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let room: String?
    let model: String?
    let online: Int
    let source: String
    let lastSeen: Double?
    let switchState: String?

    enum CodingKeys: String, CodingKey {
        case id, name, room, model, online, source
        case lastSeen = "last_seen"
        case switchState = "switch_state"
    }
}

struct Billing: Codable, Equatable {
    let start: String
    let end: String
    let today: String
    let totalDays: Int
    let elapsedDays: Int
    let daysMeasured: Int
    let coveragePct: Double
    let installments: [Installment]
    let paidToDate: Double
    let plannedTotal: Double
    let nextInstallment: Installment?
    let avgDayKwh: Double?
    let kwhMeasured: Double
    let realCostToDate: Double?
    let balance: Double?
    let projectedYearKwh: Double?
    let projectedTotal: Double?
    let projectedRegul: Double?
    let idealMonthly: Double?
}

struct Installment: Codable, Identifiable, Equatable {
    let date: String
    let amount: Double
    var id: String { date }
}

struct SwitchResponse: Decodable { let state: String }

enum ISO8601Day {
    private static let formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    static func date(from value: String) -> Date? { formatter.date(from: value) }
}

extension Double {
    var wattsText: String { formatted(.number.precision(.fractionLength(0))) + " W" }
    var kwhText: String { formatted(.number.precision(.fractionLength(2))) + " kWh" }
    var euroText: String { formatted(.currency(code: "EUR")) }
}

