import SwiftUI

private enum ContactTab: String, CaseIterable {
    case beneficiaries = "Beneficiaries"
    case trustedContacts = "Trusted Contacts"
}

struct ContactsView: View {
    @Environment(AppState.self) private var appState
    @State private var selectedTab: ContactTab = .beneficiaries
    @State private var beneficiaries: [Beneficiary] = []
    @State private var trustedContacts: [TrustedContact] = []
    @State private var isLoading = false
    @State private var showNewTrustedContact = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    Picker("", selection: $selectedTab) {
                        ForEach(ContactTab.allCases, id: \.self) {
                            Text($0.rawValue).tag($0)
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, 20)

                    if selectedTab == .beneficiaries {
                        beneficiariesContent
                    } else {
                        trustedContactsContent
                    }
                }
                .padding(.top, 12)
                .padding(.bottom, 20)
            }
            .navigationTitle("Contacts")
            .background { AuthBackground() }
            .toolbar {}
            .task { await loadAll() }
            .refreshable { await loadAll() }
            .sheet(isPresented: $showNewTrustedContact) {
                NewTrustedContactView { Task { await loadAll() } }
            }
        }
    }

    // MARK: - Beneficiaries tab

    @ViewBuilder
    private var beneficiariesContent: some View {
        VStack(spacing: 12) {
            // Explainer callout
            VStack(alignment: .leading, spacing: 8) {
                Text("What is a beneficiary?")
                    .font(.caption).fontWeight(.semibold)
                    .foregroundStyle(.secondary)
                Text("Beneficiaries receive access to your vaults after your Emergency Switch triggers. Each one gets a secure link and access key to unlock the vaults you assign them.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("If you also want someone to be notified or able to intervene in a false alarm, add them as a trusted contact too.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))

            if beneficiaries.isEmpty && !isLoading {
                ContentUnavailableView(
                    "No beneficiaries",
                    systemImage: "person.2",
                    description: Text("Add the people who should receive your vaults.")
                )
                .padding(.top, 40)
            } else {
                ForEach(beneficiaries) { b in
                    NavigationLink(destination: BeneficiaryDetailView(
                        beneficiary: b,
                        onUpdate: { Task { await loadAll() } },
                        onDelete: { Task { await loadAll() } }
                    )) {
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
                        .padding(16)
                        .vaultCardStyle(cornerRadius: 16, interactive: true)
                    }
                    .buttonStyle(.plain)
                }

                NavigationLink(destination: NewBeneficiaryView(onSave: { Task { await loadAll() } })) {
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
        }
        .padding(.horizontal, 20)
    }

    // MARK: - Trusted Contacts tab

    @ViewBuilder
    private var trustedContactsContent: some View {
        VStack(spacing: 12) {
            // Explainer callout
            VStack(alignment: .leading, spacing: 8) {
                Text("What is a trusted contact?")
                    .font(.caption).fontWeight(.semibold)
                    .foregroundStyle(.secondary)
                Text("Trusted contacts are overseers who can verify you're alive, stop a false alarm, or confirm your passing. They don't receive vault contents — they just help ensure your switch works correctly.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("The same person can be both a trusted contact and a beneficiary.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))

            if trustedContacts.isEmpty && !isLoading {
                ContentUnavailableView(
                    "No trusted contacts",
                    systemImage: "person.badge.shield.checkmark",
                    description: Text("Add people who can oversee your Emergency Switch.")
                )
                .padding(.top, 40)
            } else {
                ForEach(trustedContacts) { tc in
                    NavigationLink(destination: TrustedContactDetailView(
                        contact: tc,
                        onUpdate: { Task { await loadAll() } },
                        onDelete: { Task { await loadAll() } }
                    )) {
                        HStack(spacing: 14) {
                            ZStack {
                                Circle().fill(Color.accentColor.opacity(0.15))
                                Text(String(tc.name.prefix(1)).uppercased())
                                    .font(.system(size: 17, weight: .semibold))
                                    .foregroundStyle(Color.accentColor)
                            }
                            .frame(width: 44, height: 44)

                            VStack(alignment: .leading, spacing: 3) {
                                Text(tc.name).font(.body).fontWeight(.semibold).foregroundStyle(.primary)
                                Text(tc.email).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            permissionBadges(tc)
                            Image(systemName: "chevron.right")
                                .font(.caption).fontWeight(.semibold)
                                .foregroundStyle(.tertiary)
                        }
                        .padding(16)
                        .vaultCardStyle(cornerRadius: 16, interactive: true)
                    }
                    .buttonStyle(.plain)
                }
            }

            Button {
                showNewTrustedContact = true
            } label: {
                HStack {
                    Label("Add Trusted Contact", systemImage: "plus.circle")
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
    }

    @ViewBuilder
    private func permissionBadges(_ tc: TrustedContact) -> some View {
        HStack(spacing: 4) {
            if tc.notifyOnFinalWarning {
                Image(systemName: "bell.fill").font(.caption2).foregroundStyle(.orange)
            }
            if tc.canAbort {
                Image(systemName: "hand.raised.fill").font(.caption2).foregroundStyle(.blue)
            }
            if tc.canVerifyLife {
                Image(systemName: "heart.fill").font(.caption2).foregroundStyle(.green)
            }
            if tc.canCorroborateDeath {
                Image(systemName: "checkmark.shield.fill").font(.caption2).foregroundStyle(.purple)
            }
        }
    }

    // MARK: - Load

    private func loadAll() async {
        isLoading = true
        defer { isLoading = false }
        async let b = (try? await APIService.shared.listBeneficiaries()) ?? []
        async let tc = (try? await APIService.shared.listTrustedContacts()) ?? []
        (beneficiaries, trustedContacts) = await (b, tc)
    }
}
