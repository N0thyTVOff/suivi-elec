import SwiftUI
import WidgetKit

@main
struct WattelierWidgets: WidgetBundle {
    var body: some Widget {
        WattelierEnergyWidget()
    }
}

struct WattelierEnergyWidget: Widget {
    let kind = "WattelierEnergyWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WattelierTimelineProvider()) { entry in
            WattelierWidgetView(entry: entry)
                .environment(\.colorScheme, .dark)
                .containerBackground(for: .widget) {
                    LinearGradient(
                        colors: [Color(red: 0.08, green: 0.14, blue: 0.29), Color(red: 0.04, green: 0.08, blue: 0.17)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                }
        }
        .configurationDisplayName("Énergie Wattelier")
        .description("La puissance des prises et les consommations du jour, sans mélanger les sources.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct WattelierEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
}

struct WattelierTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> WattelierEntry {
        WattelierEntry(date: Date(), snapshot: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (WattelierEntry) -> Void) {
        completion(WattelierEntry(
            date: Date(),
            snapshot: context.isPreview ? .placeholder : WidgetSnapshotStore.load()
        ))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WattelierEntry>) -> Void) {
        let entry = WattelierEntry(date: Date(), snapshot: WidgetSnapshotStore.load())
        let nextRefresh = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date().addingTimeInterval(900)
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }
}

private struct WattelierWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: WattelierEntry

    var body: some View {
        if let snapshot = entry.snapshot {
            switch family {
            case .systemSmall: SmallEnergyWidget(snapshot: snapshot)
            case .systemMedium: MediumEnergyWidget(snapshot: snapshot)
            default: LargeEnergyWidget(snapshot: snapshot)
            }
        } else {
            WidgetConnectionView()
        }
    }
}

private struct SmallEnergyWidget: View {
    let snapshot: WidgetSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            WidgetBrand()
            Spacer(minLength: 4)
            Image(systemName: "bolt.fill")
                .foregroundStyle(.blue)
                .font(.title3)
            Text(snapshot.nowW.widgetWatts)
                .font(.system(.title, design: .rounded, weight: .bold))
                .monospacedDigit()
                .minimumScaleFactor(0.7)
            Text("Puissance des prises")
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
            WidgetFreshness(date: snapshot.updatedAt)
        }
    }
}

private struct MediumEnergyWidget: View {
    let snapshot: WidgetSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                WidgetBrand()
                Spacer()
                WidgetFreshness(date: snapshot.updatedAt)
            }
            HStack(spacing: 22) {
                WidgetMetric(symbol: "bolt.fill", title: "Prises maintenant", value: snapshot.nowW.widgetWatts, tint: .blue)
                Divider().overlay(.white.opacity(0.16))
                WidgetMetric(
                    symbol: "powerplug.fill",
                    title: "Prises aujourd’hui",
                    value: snapshot.todayPlugsKwh.widgetKwh,
                    tint: .green
                )
            }
        }
    }
}

private struct LargeEnergyWidget: View {
    let snapshot: WidgetSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                WidgetBrand()
                Spacer()
                WidgetFreshness(date: snapshot.updatedAt)
            }

            HStack(spacing: 14) {
                WidgetMetric(symbol: "bolt.fill", title: "Prises maintenant", value: snapshot.nowW.widgetWatts, tint: .blue)
                WidgetMetric(symbol: "powerplug.fill", title: "Prises aujourd’hui", value: snapshot.todayPlugsKwh.widgetKwh, tint: .green)
                WidgetMetric(symbol: "house.fill", title: "Maison aujourd’hui", value: snapshot.todayHouseKwh?.widgetKwh ?? "J+1", tint: .indigo)
            }

            Divider().overlay(.white.opacity(0.16))

            VStack(spacing: 10) {
                ForEach(snapshot.devices.prefix(3)) { device in
                    HStack(spacing: 10) {
                        Circle()
                            .fill(device.isFresh ? Color.green : Color.secondary)
                            .frame(width: 7, height: 7)
                        Text(device.name)
                            .font(.subheadline.weight(.medium))
                            .lineLimit(1)
                        Spacer()
                        Text(device.watts.widgetWatts)
                            .font(.subheadline.weight(.semibold))
                            .monospacedDigit()
                    }
                }
            }

            Spacer(minLength: 0)
            Text("Maison et prises restent deux mesures distinctes.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }
}

private struct WidgetBrand: View {
    var body: some View {
        Label("Wattelier", systemImage: "waveform.path.ecg")
            .font(.caption.weight(.bold))
            .foregroundStyle(.primary)
    }
}

private struct WidgetFreshness: View {
    let date: Date
    var body: some View {
        Text(date, style: .relative)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
    }
}

private struct WidgetMetric: View {
    let symbol: String
    let title: String
    let value: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Image(systemName: symbol).foregroundStyle(tint)
            Text(value)
                .font(.system(.title3, design: .rounded, weight: .bold))
                .monospacedDigit()
                .minimumScaleFactor(0.65)
                .lineLimit(1)
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct WidgetConnectionView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            WidgetBrand()
            Spacer()
            Image(systemName: "iphone.and.arrow.forward")
                .font(.title2)
                .foregroundStyle(.blue)
            Text("Ouvrez Wattelier")
                .font(.headline)
            Text("Connectez votre serveur pour alimenter ce widget.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

private extension Double {
    var widgetWatts: String { formatted(.number.precision(.fractionLength(0))) + " W" }
    var widgetKwh: String { formatted(.number.precision(.fractionLength(2))) + " kWh" }
}
