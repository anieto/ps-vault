import SwiftUI

// Shared avatar component: photo if available, initials circle otherwise
struct BeneficiaryAvatar: View {
    let beneficiary: Beneficiary
    var size: CGFloat = 38

    var body: some View {
        Group {
            if let dataStr = beneficiary.photoData,
               let data = Data(base64Encoded: dataStr.dropPrefix("data:image/jpeg;base64,")),
               let uiImage = UIImage(data: data) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
            } else {
                ZStack {
                    Circle().fill(Color.accentColor.opacity(0.15))
                    Text(String(beneficiary.name.prefix(1)).uppercased())
                        .font(.system(size: size * 0.4, weight: .semibold))
                        .foregroundStyle(.accent)
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
    @State private var beneficiaries: [Beneficiary] = []
    @State private var isLoading = false

    var body: some View {
        NavigationStack {
            Group {
                if beneficiaries.isEmpty && !isLoading {
                    ContentUnavailableView("No beneficiaries", systemImage: "person.2", description: Text("Add the people who should receive your vault."))
                } else {
                    List(beneficiaries) { b in
                        NavigationLink(destination: BeneficiaryDetailView(beneficiary: b, onUpdate: { Task { await load() } }, onDelete: { Task { await load() } })) {
                            HStack(spacing: 12) {
                                BeneficiaryAvatar(beneficiary: b, size: 38)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(b.name).font(.body).fontWeight(.medium)
                                    Text(b.email).font(.caption).foregroundStyle(.secondary)
                                    if let rel = b.relationship {
                                        Text(rel).font(.caption2).foregroundStyle(.secondary)
                                    }
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
            }
            .navigationTitle("Beneficiaries")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    NavigationLink(destination: NewBeneficiaryView(onSave: { Task { await load() } })) {
                        Image(systemName: "plus")
                    }
                }
            }
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
