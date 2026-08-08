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
    private static let filename = "widget-snapshot.json"

    private static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
    }

    static func load() -> WidgetSnapshot? {
        load(from: containerURL)
    }

    static func save(_ snapshot: WidgetSnapshot) {
        save(snapshot, to: containerURL)
    }

    static func clear() {
        guard let url = snapshotURL(in: containerURL) else { return }
        try? FileManager.default.removeItem(at: url)
    }

    static func load(from directory: URL?) -> WidgetSnapshot? {
        guard let url = snapshotURL(in: directory), let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    }

    static func save(_ snapshot: WidgetSnapshot, to directory: URL?) {
        guard let url = snapshotURL(in: directory), let data = try? JSONEncoder().encode(snapshot) else { return }
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    private static func snapshotURL(in directory: URL?) -> URL? {
        directory?.appendingPathComponent(filename, isDirectory: false)
    }
}
