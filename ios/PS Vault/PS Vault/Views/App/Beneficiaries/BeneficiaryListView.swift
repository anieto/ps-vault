import SwiftUI

// Shared avatar component: photo if available, initials circle otherwise
struct BeneficiaryAvatar: View {
    let beneficiary: Beneficiary
    var size: CGFloat = 38

    private var contactImage: UIImage? {
        guard let dataStr = beneficiary.photoData else { return nil }
        let raw = dataStr.hasPrefix("data:image/jpeg;base64,")
            ? String(dataStr.dropFirst("data:image/jpeg;base64,".count))
            : dataStr
        guard let data = Data(base64Encoded: raw, options: .ignoreUnknownCharacters) else { return nil }
        return UIImage(data: data)
    }

    var body: some View {
        Group {
            if let img = contactImage {
                Image(uiImage: img)
                    .resizable()
                    .scaledToFill()
            } else {
                ZStack {
                    Circle().fill(Color.accentColor.opacity(0.15))
                    Text(String(beneficiary.name.prefix(1)).uppercased())
                        .font(.system(size: size * 0.4, weight: .semibold))
                        .foregroundStyle(Color.accentColor)
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }
}

private extension String {
    func dropPrefix(_ prefix: String) -> String {
        hasPrefix(prefix) ? String(dropFirst(prefix.count)) : self
    }
}

struct BeneficiaryListView: View {
    @Environment(AppState.self) private var appState
    @State private var beneficiaries: [Beneficiary] = []
    @State private var isLoading = false

    var body: some View {
        NavigationStack {
            ScrollView {
                if beneficiaries.isEmpty && !isLoading {
                    ContentUnavailableView("No beneficiaries", systemImage: "person.2", description: Text("Add the people who should receive your vault."))
                        .padding(.top, 60)
                } else {
                    VStack(spacing: 12) {
                        ForEach(beneficiaries) { b in
                            NavigationLink(destination: BeneficiaryDetailView(beneficiary: b, onUpdate: { Task { await load() } }, onDelete: { Task { await load() } })) {
                                HStack(spacing: 14) {
                                    BeneficiaryAvatar(beneficiary: b, size: 44)
                                    VStack(alignment: .leading, spacing: 3) {
                                        HStack(spacing: 4) {
                                            Text(b.name).font(.body).fontWeight(.semibold)
                                            if let rel = b.relationship {
                                                Text("(\(rel))").font(.body).fontWeight(.regular).foregroundStyle(.secondary)
                                            }
                                        }
                                        .foregroundStyle(.primary)
                                        Text(b.email).font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .font(.caption).fontWeight(.semibold)
                                        .foregroundStyle(.tertiary)
                                }
                                .contentShape(Rectangle())
                                .padding(16)
                                .vaultCardStyle(cornerRadius: 16, interactive: true)
                            }
                            .buttonStyle(.plain)
                        }
                        NavigationLink(destination: NewBeneficiaryView(onSave: { Task { await load() } })) {
                            HStack {
                                Label("Add Beneficiary", systemImage: "plus.circle")
                                    .font(.body).fontWeight(.medium)
                                    .foregroundStyle(appState.brandColor)
                                Spacer()
                            }
                            .padding(16)
                            .vaultCardStyle(cornerRadius: 16, interactive: true)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 20)
                }
            }
            .navigationTitle("Beneficiaries")
            .background { AuthBackground() }
            .toolbar {}
            .task { await load() }
            .refreshable { await load() }
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        beneficiaries = (try? await APIService.shared.listBeneficiaries()) ?? []
    }
}
