import SwiftUI

/// A non-Identifiable view-model for beneficiary rows.
/// Using Identifiable types with ForEach/List triggers a Binding<C> overload
/// ambiguity in this project's iOS 26 compiler configuration.
struct BeneficiaryOption {
    let beneficiaryId: String
    let name: String
    let email: String
}

struct BeneficiarySelectionView: View {
    let options: [BeneficiaryOption]
    let currentId: String?
    let onSelect: (String) -> Void   // passes back the beneficiaryId
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        // ForEach(Range<Int>) is the only overload that has no Binding<C> counterpart
        // in iOS 26. List/ForEach with collection data always resolves to Binding.
        List {
            ForEach(Array(0..<options.count), id: \.self) { i in
                optionRow(options[i])
            }
        }
        .scrollContentBackground(.hidden)
        .background { AuthBackground() }
        .navigationTitle("Select Beneficiary")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }

    @ViewBuilder
    private func optionRow(_ opt: BeneficiaryOption) -> some View {
        Button {
            onSelect(opt.beneficiaryId)
            dismiss()
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 1) {
                    Text(opt.name).font(.subheadline).foregroundStyle(.primary)
                    Text(opt.email).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                if opt.beneficiaryId == currentId {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.accentColor)
                }
            }
        }
        .buttonStyle(.plain)
    }
}
