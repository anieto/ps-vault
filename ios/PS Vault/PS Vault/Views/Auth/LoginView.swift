import SwiftUI

struct LoginView: View {
    @Environment(AppState.self) private var appState
    @State private var email = ""
    @State private var password = ""
    @State private var mfaCode = ""
    @State private var needsMFA = false
    @State private var error = ""
    @State private var isLoading = false
    @State private var showRegister = false
    @State private var showForgotPassword = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    VStack(spacing: 6) {
                        Text("🔐")
                            .font(.system(size: 48))
                            .padding(.top, 60)
                        Text("P.S. Vault")
                            .font(.system(size: 28, weight: .bold))
                        Text("Sign in to your account")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.bottom, 36)

                    VStack(spacing: 16) {
                        if !needsMFA {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Email")
                                    .font(.caption).fontWeight(.medium).foregroundStyle(.secondary)
                                TextField("you@example.com", text: $email)
                                    .textFieldStyle(.roundedBorder)
                                    .keyboardType(.emailAddress)
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                            }

                            VStack(alignment: .leading, spacing: 6) {
                                Text("Password")
                                    .font(.caption).fontWeight(.medium).foregroundStyle(.secondary)
                                SecureField("Password", text: $password)
                                    .textFieldStyle(.roundedBorder)
                                    .onSubmit { Task { await login() } }
                            }
                        } else {
                            VStack(spacing: 6) {
                                Image(systemName: "lock.shield.fill")
                                    .font(.system(size: 36))
                                    .foregroundStyle(.tint)
                                Text("Two-factor authentication")
                                    .font(.headline)
                                Text("Enter the 6-digit code from your authenticator app.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .multilineTextAlignment(.center)
                            }
                            .padding(.bottom, 4)

                            VStack(alignment: .leading, spacing: 6) {
                                Text("Authentication code")
                                    .font(.caption).fontWeight(.medium).foregroundStyle(.secondary)
                                TextField("000000", text: $mfaCode)
                                    .textFieldStyle(.roundedBorder)
                                    .keyboardType(.numberPad)
                                    .font(.system(.body, design: .monospaced))
                                    .onSubmit { Task { await login() } }
                            }

                            Button("Use a different account") {
                                needsMFA = false
                                mfaCode = ""
                                error = ""
                            }
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        }

                        if !error.isEmpty {
                            Text(error)
                                .font(.caption)
                                .foregroundStyle(.red)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        Button(action: { Task { await login() } }) {
                            Group {
                                if isLoading {
                                    ProgressView().tint(.white)
                                } else {
                                    Text(needsMFA ? "Verify" : "Sign in").fontWeight(.semibold)
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 50)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(isLoading || (needsMFA ? mfaCode.count < 6 : email.isEmpty || password.isEmpty))

                        if !needsMFA {
                            Button("Forgot password?") { showForgotPassword = true }
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.horizontal, 32)

                    if !needsMFA {
                        Divider().padding(.vertical, 28).padding(.horizontal, 32)

                        VStack(spacing: 8) {
                            Text("Don't have an account?")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            Button("Create account") { showRegister = true }
                                .fontWeight(.medium)
                        }
                        .padding(.bottom, 32)
                    }
                }
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Change server") {
                        appState.setServerURL("")
                    }
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                }
            }
            .sheet(isPresented: $showRegister) { RegisterView() }
            .sheet(isPresented: $showForgotPassword) { ForgotPasswordView() }
        }
    }

    private func login() async {
        error = ""
        isLoading = true
        defer { isLoading = false }
        do {
            let response = try await APIService.shared.login(
                email: email,
                password: password,
                mfaCode: needsMFA ? mfaCode : nil
            )
            guard let accessToken = response.accessToken,
                  let refreshToken = response.refreshToken,
                  let user = response.user else {
                error = "Unexpected response from server."
                return
            }

            // Derive MEK from password using Argon2id, then unwrap it with KEK
            var mek: Data? = nil
            if let mekSalt = response.mekSalt,
               let mekEnvelope = response.mekEnvelope,
               let argon2Params = response.argon2Params {
                do {
                    let kek = try CryptoService.deriveKEK(
                        password: password,
                        mekSaltHex: mekSalt,
                        argon2ParamsJSON: argon2Params
                    )
                    mek = try CryptoService.unwrapMEK(envelope: mekEnvelope, kek: kek)
                } catch {
                    // Crypto failed — sign in without MEK, entries won't decrypt
                    // (this shouldn't happen with correct credentials)
                }
            }

            appState.signIn(accessToken: accessToken, refreshToken: refreshToken, user: user, mek: mek)
            // Persist crypto params for password-based unlock (not secret — MEK is encrypted)
            if let mekSalt = response.mekSalt,
               let mekEnvelope = response.mekEnvelope,
               let argon2Params = response.argon2Params {
                appState.saveCryptoParams(mekSalt: mekSalt, mekEnvelope: mekEnvelope, argon2Params: argon2Params)
            }
        } catch let e as APIError {
            if case .httpError(_, let code) = e {
                switch code {
                case "mfa_required":
                    needsMFA = true
                    error = ""
                case "invalid_credentials":
                    error = "Incorrect email or password."
                case "invalid_mfa":
                    error = "Invalid authentication code."
                default:
                    error = e.errorDescription ?? "Login failed."
                }
            } else {
                error = e.errorDescription ?? "Login failed."
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

#Preview {
    LoginView()
        .environment(AppState())
}
