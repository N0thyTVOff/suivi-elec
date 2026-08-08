import Foundation

struct WidgetSnapshot: Codable, Equatable {
    struct Device: Codable, Equatable, Identifiable {
        let id: String
        let name: String
        let watts: Double
        let isFresh: Bool
    }

    let updatedAt: Date
    let serverName: String
    let isDemo: Bool
    let nowW: Double
    let todayPlugsKwh: Double
    let todayHouseKwh: Double?
    let devices: [Device]

    static let placeholder = WidgetSnapshot(
        updatedAt: Date(),
        serverName: "Wattelier",
        isDemo: true,
        nowW: 684,
        todayPlugsKwh: 2.67,
        todayHouseKwh: 8.42,
        devices: [
            Device(id: "bureau", name: "Bureau", watts: 146, isFresh: true),
            Device(id: "salon", name: "Télévision", watts: 92, isFresh: true),
            Device(id: "cuisine", name: "Lave-vaisselle", watts: 446, isFresh: true)
        ]
    )
}

enum WidgetSnapshotStore {
    static let appGroup = "group.com.n0thytvoff.Wattelier"
    private static let key = "widgetSnapshot"

    static func load() -> WidgetSnapshot? {
        guard let data = UserDefaults(suiteName: appGroup)?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    }

    static func save(_ snapshot: WidgetSnapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        UserDefaults(suiteName: appGroup)?.set(data, forKey: key)
    }

    static func clear() {
        UserDefaults(suiteName: appGroup)?.removeObject(forKey: key)
    }
}
