import SwiftUI

// Chrome shared by the Messages extension and the host app, so the two can't
// drift apart: tab identity, the chip bar, the who's-in strip, and the
// field-themed enrollment screen.

enum SpreadTab: Int, CaseIterable {
    case thisWeek, leaderboard, history, profile

    var title: String {
        switch self {
        case .thisWeek: return "This Week"
        case .leaderboard: return "Leaders"
        case .history: return "History"
        case .profile: return "Profile"
        }
    }

    var icon: String {
        switch self {
        case .thisWeek: return "sportscourt.fill"
        case .leaderboard: return "list.number"
        case .history: return "clock.fill"
        case .profile: return "person.crop.circle.fill"
        }
    }
}

struct ChipTabBar: View {
    @Binding var selection: SpreadTab

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(SpreadTab.allCases, id: \.rawValue) { tab in
                    Button {
                        withAnimation(.easeOut(duration: 0.15)) { selection = tab }
                    } label: {
                        HStack(spacing: 5) {
                            Image(systemName: tab.icon).font(.system(size: 13, weight: .semibold))
                            Text(tab.title).font(.system(size: 14, weight: .semibold))
                        }
                        .padding(.horizontal, 14).padding(.vertical, 9)
                        .background(Capsule().fill(selection == tab ? Color.primary : Color(.systemGray6)))
                        .foregroundStyle(selection == tab ? Color(.systemBackground) : Color.primary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 12)
        }
        .padding(.top, 10).padding(.bottom, 6)
    }
}

/// Pre-lock clarity: who's in, and an explicit note that picks stay hidden.
struct WhosInStrip: View {
    let week: WeekResponse

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                ForEach(week.players) { p in
                    HStack(spacing: 3) {
                        Image(systemName: p.hasPicked ? "checkmark.circle.fill" : "circle.dotted")
                            .font(.system(size: 11))
                            .foregroundStyle(p.hasPicked ? .green : .secondary)
                        Text(p.displayName)
                            .font(.system(size: 11, weight: .medium))
                    }
                    .padding(.horizontal, 8).padding(.vertical, 5)
                    .background(Capsule().fill(Color(.systemGray6)))
                }
            }
            Text("Everyone's picks are revealed here at lock — nobody can see yours before then.")
                .font(.caption2).foregroundStyle(.tertiary)
        }
        .padding(.horizontal, 14)
    }
}

/// Enrollment on the field.
struct EnrollFieldView: View {
    @Binding var code: String
    let onEnroll: () -> Void

    var body: some View {
        ZStack {
            FieldBackground().ignoresSafeArea()
            VStack(spacing: 16) {
                Spacer()
                Text("🏈")
                    .font(.system(size: 56))
                Text("THE SPREAD")
                    .font(.system(size: 34, weight: .black))
                    .foregroundStyle(Color(red: 1, green: 0.84, blue: 0.3))
                Text("Pick a team. They only have to win.\nThe spread is your payout.")
                    .font(.subheadline)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white.opacity(0.85))
                VStack(spacing: 10) {
                    TextField("Enrollment code", text: $code)
                        .textFieldStyle(.roundedBorder)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .frame(maxWidth: 220)
                    Button(action: onEnroll) {
                        Text("Let's ride")
                            .font(.headline)
                            .frame(maxWidth: 220)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color(red: 1, green: 0.84, blue: 0.3))
                    .foregroundStyle(.black)
                    .disabled(code.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                .padding(20)
                .background(RoundedRectangle(cornerRadius: 16).fill(.ultraThinMaterial))
                Spacer()
                Spacer()
            }
            .padding()
        }
    }
}
