import SwiftUI

enum WattelierTheme {
    static let accent = Color(red: 52 / 255, green: 91 / 255, blue: 232 / 255)
    static let alert = Color(red: 233 / 255, green: 71 / 255, blue: 122 / 255)
    static let success = Color(red: 22 / 255, green: 162 / 255, blue: 116 / 255)
    static let warning = Color(red: 231 / 255, green: 154 / 255, blue: 25 / 255)
    static let signalNavy = Color(red: 12 / 255, green: 22 / 255, blue: 48 / 255)

    static let deviceColors: [Color] = [
        accent, success, warning, Color.purple, alert, Color.cyan, Color.indigo
    ]
}

enum AppAppearance: String, CaseIterable, Identifiable {
    case system, light, dark

    var id: String { rawValue }
    var label: String {
        switch self {
        case .system: "Automatique"
        case .light: "Clair"
        case .dark: "Sombre"
        }
    }
}

